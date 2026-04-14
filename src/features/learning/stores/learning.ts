import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '../../../stores/auth'

export interface Topic {
  id: string
  title: string
  learn: boolean
  practice: boolean
  master: boolean
}

export interface Subject {
  id: string
  title: string
  color: string
  topics: Topic[]
}

export const useLearningStore = defineStore('learning', () => {
  const authStore = useAuthStore()
  const subjects = ref<Subject[]>([])
  const isLoading = ref(false)

  // Veritabanından verileri çek
  const fetchSubjects = async () => {
    if (!authStore.user) return
    isLoading.value = true
    try {
      const { data, error } = await supabase
        .from('learning_subjects')
        .select('*')
        .eq('user_id', authStore.user.id)
        .order('created_at', { ascending: true })

      if (error) throw error
      if (data) subjects.value = data
    } catch (err) {
      console.error('Error fetching subjects:', err)
    } finally {
      isLoading.value = false
    }
  }

  // Yeni ders/ünite ekle (Optimistic UI: Önce ekrana ekler, sonra DB'ye kaydeder)
  const addSubject = async (title: string, color: string) => {
    if (!authStore.user) return
    
    // Geçici ID ile hemen ekranda göster
    const tempId = 'temp-' + Date.now()
    const newSubject: Subject = { id: tempId, title, color, topics: [] }
    subjects.value.push(newSubject)

    try {
      const { data, error } = await supabase
        .from('learning_subjects')
        .insert({ user_id: authStore.user.id, title, color, topics: [] })
        .select()
        .single()

      if (error) throw error
      // İşlem başarılıysa geçici ID'yi veritabanından gelen gerçek UUID ile değiştir
      const index = subjects.value.findIndex(s => s.id === tempId)
      if (index !== -1) subjects.value[index] = data
    } catch (err) {
      console.error('Error adding subject:', err)
      // Hata olursa ekrandan geri sil
      subjects.value = subjects.value.filter(s => s.id !== tempId)
    }
  }

  // Dersi sil
  const deleteSubject = async (id: string) => {
    const previous = [...subjects.value]
    subjects.value = subjects.value.filter(s => s.id !== id) // Anında UI'dan sil

    try {
      const { error } = await supabase.from('learning_subjects').delete().eq('id', id)
      if (error) throw error
    } catch (err) {
      console.error('Error deleting subject:', err)
      subjects.value = previous // Hata olursa geri al
    }
  }

  // Konuları arka planda güncelle (JSONB formatında olduğu için direkt update ediyoruz)
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
  const addTopic = (subjectId: string, title: string) => {
    const subject = subjects.value.find(s => s.id === subjectId)
    if (!subject) return

    const newTopic: Topic = {
      id: Date.now().toString(),
      title,
      learn: false,
      practice: false,
      master: false
    }
    subject.topics.push(newTopic)
    syncTopicsToDb(subjectId, subject.topics)
  }

  // Konu Silme
  const deleteTopic = (subjectId: string, topicId: string) => {
    const subject = subjects.value.find(s => s.id === subjectId)
    if (!subject) return

    subject.topics = subject.topics.filter(t => t.id !== topicId)
    syncTopicsToDb(subjectId, subject.topics)
  }

  // Konu Durumunu Değiştirme (Tıklama İşlemi)
  const toggleTopicStatus = (subjectId: string, topicId: string, phase: 'learn' | 'practice' | 'master') => {
    const subject = subjects.value.find(s => s.id === subjectId)
    if (!subject) return

    const topic = subject.topics.find(t => t.id === topicId)
    if (!topic) return

    topic[phase] = !topic[phase]
    syncTopicsToDb(subjectId, subject.topics)
  }

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