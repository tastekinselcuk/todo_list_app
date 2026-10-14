import { defineWorkspaceStore as defineStore, useWorkspaceClient } from '@/lib/workspaceScope'
import { ref } from 'vue'
import { useAuthStore } from '../../../stores/auth'

export interface Topic {
  _version?: number
  id: string
  title: string
  learn: boolean
  practice: boolean
  master: boolean
}

export interface Subject {
  version?: number
  id: string
  title: string
  color: string
  topics: Topic[]
}

export const useLearningStore = defineStore('learning', () => {
  const authStore = useAuthStore()
  const supabase = useWorkspaceClient()
  const subjects = ref<Subject[]>([])
  const isLoading = ref(false)
  const savingChildren = ref(0)
  async function changeItem(parentId: string, operation: string, item: Record<string, unknown>, version?: number) {
    savingChildren.value++
    try {
      const result = await supabase.mutateItem('learning', parentId, operation, item, version)
      const current = subjects.value.find(subject => subject.id === parentId)
      if (current && (current.version ?? 0) <= result.version) Object.assign(current, result)
      return true
    } catch (err) { console.error('Topic not saved:', err); return false }
    finally { savingChildren.value-- }
  }

  // Veritabanından verileri çek
  let fetchSubjectsGeneration = 0
  const fetchSubjects = async (targetId?: string) => {
    const request = ++fetchSubjectsGeneration
    if (!authStore.user) return false
    isLoading.value = true
    try {
      let { data, error } = await supabase
        .from('learning_subjects')
        .select('*')
        .eq('user_id', authStore.user.id)
        .order('created_at', { ascending: true })

      if (request !== fetchSubjectsGeneration) return false
      if (error) throw error
      if (typeof targetId === 'string' && !(data || []).some((row: { id: string }) => row.id === targetId)) {
        const located = await supabase.from('learning_subjects').select('*').eq('id', targetId).maybeSingle()
        if (located.error) throw located.error
        if (located.data) data = [located.data, ...(data || [])]
      }
      if (request !== fetchSubjectsGeneration) return false
      if (data) subjects.value = data
      return true
    } catch (err) {
      if (request !== fetchSubjectsGeneration) return false
      console.error('Error fetching subjects:', err)
      return false
    } finally {
      if (request === fetchSubjectsGeneration) isLoading.value = false
    }
  }

  // Yeni ders/ünite ekle (Optimistic UI: Önce ekrana ekler, sonra DB'ye kaydeder)
  const addSubject = async (title: string, color: string) => {
    if (!authStore.user) return false
    savingChildren.value++
    try {
      const { data, error } = await supabase.from('learning_subjects').insert({ user_id: authStore.user.id, title, color, topics: [] }).select().single()
      if (error) throw error
      subjects.value.push(data)
      return true
    } catch { return false }
    finally { savingChildren.value-- }
  }

  const deleteSubject = async (id: string) => {
    savingChildren.value++
    try {
      const { error } = await supabase.from('learning_subjects').delete().eq('id', id)
      if (error) throw error
      subjects.value = subjects.value.filter(item => item.id !== id)
      return true
    } catch { return false }
    finally { savingChildren.value-- }
  }

  const syncTopicsToDb = async (subjectId: string, topics: Topic[]) => {
    try {
      const { error } = await supabase
        .from('learning_subjects')
        .update({ topics })
        .eq('id', subjectId)

      if (error) throw error
    } catch (err) {
      console.error('Error updating topics:', err)
    }
  }

  // Konu Ekleme
  const addTopic = async (subjectId: string, title: string) => {
    const subject = subjects.value.find(s => s.id === subjectId)
    if (!subject) return
    if (supabase.collection('learning')) {
      return changeItem(subjectId, 'add', { title, learn: false, practice: false, master: false })
    }

    const newTopic: Topic = {
      id: Date.now().toString(),
      title,
      learn: false,
      practice: false,
      master: false
    }
    subject.topics.push(newTopic)
    syncTopicsToDb(subjectId, subject.topics)
    return true
  }

  // Konu Silme
  const deleteTopic = async (subjectId: string, topicId: string) => {
    const subject = subjects.value.find(s => s.id === subjectId)
    if (!subject) return false
    if (supabase.collection('learning')) {
      const topic = subject.topics.find(t => t.id === topicId)
      return changeItem(subjectId, 'delete', { id: topicId }, topic?._version)
    }

    subject.topics = subject.topics.filter(t => t.id !== topicId)
    syncTopicsToDb(subjectId, subject.topics)
    return true
  }

  // Konu Durumunu Değiştirme (Tıklama İşlemi)
  const toggleTopicStatus = async (subjectId: string, topicId: string, phase: 'learn' | 'practice' | 'master') => {
    const subject = subjects.value.find(s => s.id === subjectId)
    if (!subject) return false

    const topic = subject.topics.find(t => t.id === topicId)
    if (!topic) return false
    if (supabase.collection('learning')) {
      return changeItem(subjectId, 'update', { id: topicId, [phase]: !topic[phase] }, topic._version)
    }

    topic[phase] = !topic[phase]
    syncTopicsToDb(subjectId, subject.topics)
    return true
  }

  supabase.listen?.({ learning_subjects: fetchSubjects }, () => isLoading.value || Boolean(savingChildren.value))
  return {
    subjects,
    isLoading,
    fetchSubjects,
    addSubject,
    deleteSubject,
    addTopic,
    deleteTopic,
    toggleTopicStatus
  }
})
