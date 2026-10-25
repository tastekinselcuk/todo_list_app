import { defineWorkspaceStore as defineStore, useWorkspaceClient, workspaceStorageKey } from '@/lib/workspaceScope'
import { ref, watch } from 'vue'
import { useAuthStore } from '../../../stores/auth'
import { readStoredJSON, writeStoredJSON } from '@/lib/storage'

export const TODO_TITLE_MAX_LENGTH = 120

export type Priority = 'low' | 'medium' | 'high'

const getCurrentUserId = async () => useAuthStore().user?.id || null

export interface Todo {
  version?: number;
  id: string;
  title: string;
  description: string;
  completed: boolean;
  categoryId: string | null;
  priority: 'low' | 'medium' | 'high';
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string
  name: string
  color: string
  icon: string
}

export interface QuickNote {
  id: string;
  content: string;
  createdAt: string;
  completed: boolean;
}

export interface CodeSnippet {
  version?: number;
  id: string;
  title: string;
  language: string;
  code: string;
  createdAt: string;
  updatedAt: string;
}

const defaultCategories: Category[] = [
  { id: '1', name: 'Work', color: '#EF4444', icon: 'briefcase' },
  { id: '2', name: 'Personal', color: '#3B82F6', icon: 'user' },
  { id: '3', name: 'Shopping', color: '#10B981', icon: 'shopping-bag' },
  { id: '4', name: 'Fitness', color: '#F59E0B', icon: 'dumbbell' },
]

const STORAGE_KEY = 'todo-app-data'

export const useTodoStore = defineStore('todo', () => {
  const supabase = useWorkspaceClient()
  const storageKey = workspaceStorageKey(STORAGE_KEY)
  const emptyData = {
    todos: [],
    categories: [],
    quickNotes: [],
    codeSnippets: [],
  }
  const initialData = readStoredJSON(storageKey, emptyData, value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false
    const data = value as Record<string, unknown>
    return ['todos', 'categories', 'quickNotes', 'codeSnippets'].every(key =>
      data[key] === undefined || (Array.isArray(data[key]) && data[key].every(item =>
        item && typeof item === 'object' && typeof item.id === 'string')))
      && (data.todoOrder === undefined || (Array.isArray(data.todoOrder) && data.todoOrder.every(id => typeof id === 'string')))
  }) as typeof emptyData & { todoOrder?: string[] }

  const todos = ref<Todo[]>(initialData.todos || [])
  const todoOrder = ref<string[]>(initialData.todoOrder || [])
  const categories = ref<Category[]>(initialData.categories || [])
  const quickNotes = ref<QuickNote[]>(initialData.quickNotes || [])
  const codeSnippets = ref<CodeSnippet[]>(initialData.codeSnippets || [])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  watch(
    [todos, todoOrder, categories, quickNotes, codeSnippets],
    () => {
      writeStoredJSON(storageKey, {
        todos: todos.value,
        todoOrder: todoOrder.value,
        categories: categories.value,
        quickNotes: quickNotes.value,
        codeSnippets: codeSnippets.value,
      })
    },
    { deep: true }
  )

  // ===== CATEGORY OPERATIONS =====
  const fetchCategories = async () => {
    isLoading.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase
        .from('categories')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (err) throw err
      categories.value = (data || []).map((cat: Record<string, any>) => ({
        id: cat.id,
        name: cat.name,
        color: cat.color || '#3B82F6',
        icon: cat.icon || 'folder'
      }))
      return true
    } catch (err) {
      error.value = (err as Error).message
      console.error('Error fetching categories:', err)
      return false
    } finally {
      isLoading.value = false
    }
  }

  const addCategory = async (category: Omit<Category, 'id'>) => {
    isLoading.value = true
    error.value = null
    try {
      const existing = categories.value.find(c => 
        c.name.toLowerCase().trim() === category.name.toLowerCase().trim()
      )
      if (existing) {
        error.value = `A category with the name "${category.name}" already exists.`
        return { success: false, message: error.value }
      }

      const userId = await getCurrentUserId()
      const { data, error: err } = await supabase
        .from('categories')
        .insert([{ created_by: userId, name: category.name, color: category.color, icon: category.icon }])
        .select()
      
      if (err) throw err
      
      // HATA ÇÖZÜMÜ: err yoksa Supabase işlemi 201 Created ile başarmıştır.
      const record = data && Array.isArray(data) ? data[0] : data;
      if (record && record.id) {
        categories.value.unshift({ id: record.id, name: record.name, color: record.color, icon: record.icon })
      } else {
        await fetchCategories() // Data anında dönmediyse listeyi yeniden çek
      }
      
      return { success: true }
    } catch (err) {
      error.value = (err as Error).message
      return { success: false, message: error.value }
    } finally {
      isLoading.value = false
    }
  }

  const editCategory = async (id: string, updates: Partial<Category>) => {
    isLoading.value = true
    error.value = null
    try {
      if (updates.name) {
        const existing = categories.value.find(c => c.name.toLowerCase().trim() === updates.name!.toLowerCase().trim() && c.id !== id)
        if (existing) {
          error.value = `A category with the name "${updates.name}" already exists.`
          return { success: false, message: error.value }
        }
      }

      const { error: err } = await supabase.from('categories').update({ name: updates.name, color: updates.color, icon: updates.icon }).eq('id', id)
      
      if (err) throw err
      
      const index = categories.value.findIndex(c => c.id === id)
      if (index !== -1) {
        categories.value[index] = { ...categories.value[index], ...updates }
      }
      
      return { success: true }
    } catch (err) {
      error.value = (err as Error).message
      return { success: false, message: error.value }
    } finally {
      isLoading.value = false
    }
  }

  const deleteCategory = async (id: string) => {
    isLoading.value = true
    error.value = null
    try {
      if (categories.value.length <= 1) {
        error.value = 'Cannot delete the last category'
        return { success: false, message: error.value }
      }

      const receipt=await supabase.removeCategory(id)
      
      categories.value = categories.value.filter(c => c.id !== id)
      const versions=new Map(receipt.notes.map(note=>[note.id,note.version]))
      todos.value = todos.value.map(todo=>todo.categoryId===id?{...todo,categoryId:null,version:versions.get(todo.id)??todo.version}:todo)
      
      return { success: true }
    } catch (err) {
      error.value = (err as Error).message
      return { success: false, message: error.value }
    } finally {
      isLoading.value = false
    }
  }

  const getTodosInCategory = (categoryId: string) => {
    return todos.value.filter(todo => todo.categoryId === categoryId).length
  }

  // ===== TODO OPERATIONS =====
  let fetchTodosGeneration = 0
  const fetchTodos = async (targetId?: string) => {
    const request = ++fetchTodosGeneration
    isLoading.value = true
    error.value = null
    try {
      let { data, error: err } = await supabase
        .from('todos')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (request !== fetchTodosGeneration) return false
      if (err) throw err
      if (typeof targetId === 'string' && !(data || []).some((row: { id: string }) => row.id === targetId)) {
        const located = await supabase.from('todos').select('*').eq('id', targetId).maybeSingle()
        if (located.error) throw located.error
        if (located.data) data = [located.data, ...(data || [])]
      }
      if (request !== fetchTodosGeneration) return false
      const fetched: Todo[] = (data || []).map((todo: Record<string, any>) => ({
        version: todo.version,
        id: todo.id,
        title: todo.title,
        description: todo.description || '',
        completed: todo.completed || false,
        categoryId: todo.category_id || '',
        priority: todo.priority || 'medium',
        dueDate: todo.due_date || null,
        createdAt: todo.created_at,
        updatedAt: todo.updated_at
      }))
      // Manual ordering is a local workspace preference; new notes remain first.
      const positions = new Map(todoOrder.value.map((id, index) => [id, index]))
      todos.value = positions.size
        ? [...fetched.filter(todo => !positions.has(todo.id)), ...fetched.filter(todo => positions.has(todo.id)).sort((a, b) => positions.get(a.id)! - positions.get(b.id)!)]
        : fetched
      if (positions.size) todoOrder.value = [...fetched.filter(todo=>!positions.has(todo.id)).map(todo=>todo.id),...todoOrder.value]
      return true
    } catch (err) {
      if (request !== fetchTodosGeneration) return false
      error.value = (err as Error).message
      console.error('Error fetching todos:', err)
      return false
    } finally {
      if (request === fetchTodosGeneration) isLoading.value = false
    }
  }

  const addTodo = async (todo: Omit<Todo, 'id' | 'createdAt' | 'updatedAt'>) => {
    if(todo.title.trim().length>TODO_TITLE_MAX_LENGTH){error.value='TITLE_TOO_LONG';return {success:false,message:error.value}}
    isLoading.value = true
    error.value = null
    try {
      const userId = await getCurrentUserId()
      if (!userId) {
        throw new Error('User not authenticated')
      }

      if (categories.value.length === 0) {
        await fetchCategories()
      }

      if (categories.value.length === 0) {
        for (const cat of defaultCategories) {
          try {
            const { data: catData, error: catErr } = await supabase
              .from('categories')
              .insert([{ created_by: userId, name: cat.name, color: cat.color, icon: cat.icon }])
              .select()
            
            if (catErr) {
              continue
            }
            
            const record = catData && Array.isArray(catData) ? catData[0] : catData;
            if (record && record.id) {
              categories.value.push({ id: record.id, name: record.name, color: record.color, icon: record.icon })
            }
          } catch (catErr) {
            console.warn('Exception creating default category:', catErr)
          }
        }
      }

      let categoryId = String(todo.categoryId || '').trim()
      if (!categoryId || !categories.value.find(c => c.id === categoryId)) {
        categoryId = categories.value[0]?.id || ''
        if (!categoryId) {
          error.value = 'No categories available. Please create a category first.'
          return { success: false, message: error.value }
        }
      }
      
      if (!categoryId) {
        error.value = 'Invalid category ID'
        return { success: false, message: error.value }
      }

      const { data, error: err } = await supabase
        .from('todos')
        .insert([{
          created_by: userId,
          title: todo.title,
          description: todo.description,
          completed: todo.completed,
          category_id: categoryId,
          priority: todo.priority,
          due_date: todo.dueDate
        }])
        .select()
      
      if (err) throw err
      
      // HATA ÇÖZÜMÜ: Eğer err yoksa Supabase işlemi kesinlikle tamamlamıştır.
      // RLS yüzünden data boş dönse bile bunu başarılı kabul etmeliyiz!
      const record = data && Array.isArray(data) ? data[0] : data;

      if (record && record.id) {
        // Data direkt geldiyse hemen UI'a ekle
        const newTodo = {
          version: record.version,
          id: record.id,
          title: record.title,
          description: record.description || '',
          completed: record.completed,
          categoryId: record.category_id || '',
          priority: record.priority,
          dueDate: record.due_date || null,
          createdAt: record.created_at,
          updatedAt: record.updated_at
        }
        todos.value.unshift(newTodo)
      } else {
        // Data boş döndüyse ama hata yoksa, listeyi tazeleyelim
        await fetchTodos()
      }

      return { success: true }
    } catch (err) {
      error.value = (err as Error).message
      console.error('Error adding todo:', err)
      return { success: false, message: error.value }
    } finally {
      isLoading.value = false
    }
  }

  const toggleTodo = async (id: string) => {
    isLoading.value = true
    try {
      const todo = todos.value.find(t => t.id === id)
      if (!todo) return false
      
      const { data, error: err } = await supabase.from('todos').update({ completed: !todo.completed }).eq('id', id).select().single()
      
      if (err) throw err
      todo.completed = !todo.completed
      if (data?.version !== undefined) todo.version = data.version
      return true
    } catch (err) {
      error.value = (err as Error).message
      console.error('Error toggling todo:', err)
      return false
    } finally {
      isLoading.value = false
    }
  }

  const updateTodo = async (updatedTodo: Todo) => {
    const previous=todos.value.find(todo=>todo.id===updatedTodo.id)
    if(updatedTodo.title.trim().length>TODO_TITLE_MAX_LENGTH && updatedTodo.title.trim()!==previous?.title.trim()){error.value='TITLE_TOO_LONG';return false}
    isLoading.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase
        .from('todos')
        .update({
          ...(updatedTodo.version === undefined ? {} : { version: updatedTodo.version }),
          title: updatedTodo.title,
          description: updatedTodo.description,
          completed: updatedTodo.completed,
          category_id: updatedTodo.categoryId,
          priority: updatedTodo.priority,
          due_date: updatedTodo.dueDate
        })
        .eq('id', updatedTodo.id)
      
      if (err) throw err
      
      const index = todos.value.findIndex(t => t.id === updatedTodo.id)
      if (index !== -1) {
        const record = Array.isArray(data) ? data[0] : data
        todos.value[index] = { ...updatedTodo, ...(record?.version === undefined ? {} : { version: record.version }) }
      }
      return true
    } catch (err) {
      error.value = (err as Error).message
      console.error('Error updating todo:', err)
      return false
    } finally {
      isLoading.value = false
    }
  }

  const deleteTodo = async (id: string) => {
    isLoading.value = true
    error.value = null
    try {
      const { error: err } = await supabase.from('todos').delete().eq('id', id)
      
      if (err) throw err
      
      todos.value = todos.value.filter(t => t.id !== id)
      return true
    } catch (err) {
      error.value = (err as Error).message
      console.error('Error deleting todo:', err)
      return false
    } finally {
      isLoading.value = false
    }
  }

  const editTodo = (id: string, updates: Partial<Todo>) => {
    const todo = todos.value.find(t => t.id === id)
    if (todo) {
      if(updates.title && updates.title.trim().length>TODO_TITLE_MAX_LENGTH && updates.title.trim()!==todo.title.trim())return
      Object.assign(todo, updates)
    }
  }

  const reorderTodos = (newOrder: Todo[]) => {
    if (!supabase.canWrite('detailed')) return
    // Only replace the visible slots. Filtered/grouped dragging must retain hidden notes.
    const current = new Map(todos.value.map(todo => [todo.id, todo]))
    const seen = new Set<string>()
    const ordered = newOrder.filter(todo => {
      if (!current.has(todo.id) || seen.has(todo.id)) return false
      seen.add(todo.id)
      return true
    }).map(todo => current.get(todo.id)!)
    let index = 0
    todos.value = todos.value.map(todo => seen.has(todo.id) ? ordered[index++]! : todo)
    const activeOrder=todos.value.map(todo=>todo.id),activeIds=new Set(activeOrder),previous=new Set(todoOrder.value)
    const retained=activeOrder.filter(id=>previous.has(id));let cursor=0
    todoOrder.value=[...activeOrder.filter(id=>!previous.has(id)),...todoOrder.value.map(id=>activeIds.has(id)?retained[cursor++]!:id)]
  }

  // ===== QUICK NOTES OPERATIONS =====
  let fetchQuickNotesGeneration = 0
  const fetchQuickNotes = async (targetId?: string) => {
    const request = ++fetchQuickNotesGeneration
    isLoading.value = true
    error.value = null
    try {
      let { data, error: err } = await supabase
        .from('quick_notes')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (request !== fetchQuickNotesGeneration) return false
      if (err) throw err
      if (typeof targetId === 'string' && !(data || []).some((row: { id: string }) => row.id === targetId)) {
        const located = await supabase.from('quick_notes').select('*').eq('id', targetId).maybeSingle()
        if (located.error) throw located.error
        if (located.data) data = [located.data, ...(data || [])]
      }
      if (request !== fetchQuickNotesGeneration) return false
      quickNotes.value = (data || []).map((note: Record<string, any>) => ({
        id: note.id,
        content: note.content,
        createdAt: note.created_at,
        completed: note.completed || false
      }))
      return true
    } catch (err) {
      if (request !== fetchQuickNotesGeneration) return false
      error.value = (err as Error).message
      console.error('Error fetching quick notes:', err)
      return false
    } finally {
      if (request === fetchQuickNotesGeneration) isLoading.value = false
    }
  }

  const addQuickNote = async (content: string) => {
    isLoading.value = true
    error.value = null
    try {
      const userId = await getCurrentUserId()
      const { data, error: err } = await supabase
        .from('quick_notes')
        .insert([{ created_by: userId, content, completed: false }])
        .select()
      
      if (err) throw err
      
      const record = data && Array.isArray(data) ? data[0] : data;
      if (record && record.id) {
        quickNotes.value.unshift({ id: record.id, content: record.content, createdAt: record.created_at, completed: false })
      } else {
        await fetchQuickNotes()
      }
      return { success: true }
    } catch (err) {
      error.value = (err as Error).message
      console.error('Error adding quick note:', err)
      return { success: false, message: error.value }
    } finally {
      isLoading.value = false
    }
  }

  const toggleQuickNote = async (id: string) => {
    isLoading.value = true
    try {
      const note = quickNotes.value.find(n => n.id === id)
      if (!note) return
      
      const { error: err } = await supabase.from('quick_notes').update({ completed: !note.completed }).eq('id', id)
      
      if (err) throw err
      note.completed = !note.completed
      return true
    } catch (err) {
      error.value = (err as Error).message
      console.error('Error toggling quick note:', err)
      return false
    } finally {
      isLoading.value = false
    }
  }

  const deleteQuickNote = async (id: string) => {
    isLoading.value = true
    error.value = null
    try {
      const { error: err } = await supabase.from('quick_notes').delete().eq('id', id)
      
      if (err) throw err
      
      quickNotes.value = quickNotes.value.filter(note => note.id !== id)
      return true
    } catch (err) {
      error.value = (err as Error).message
      console.error('Error deleting quick note:', err)
      return false
    } finally {
      isLoading.value = false
    }
  }

  // ===== CODE SNIPPETS OPERATIONS =====
  let fetchCodeSnippetsGeneration = 0
  const fetchCodeSnippets = async (targetId?: string) => {
    const request = ++fetchCodeSnippetsGeneration
    isLoading.value = true
    error.value = null
    try {
      let { data, error: err } = await supabase
        .from('code_snippets')
        .select('*')
        .order('created_at', { ascending: false })

      if (request !== fetchCodeSnippetsGeneration) return false
      if (err) throw err
      if (typeof targetId === 'string' && !(data || []).some((row: { id: string }) => row.id === targetId)) {
        const located = await supabase.from('code_snippets').select('*').eq('id', targetId).maybeSingle()
        if (located.error) throw located.error
        if (located.data) data = [located.data, ...(data || [])]
      }
      if (request !== fetchCodeSnippetsGeneration) return false
      codeSnippets.value = (data || []).map((snippet: Record<string, any>) => ({
        version: snippet.version,
        id: snippet.id,
        title: snippet.title || 'Untitled snippet',
        language: snippet.language || 'plaintext',
        code: snippet.code || '',
        createdAt: snippet.created_at,
        updatedAt: snippet.updated_at
      }))
      return true
    } catch (err) {
      if (request !== fetchCodeSnippetsGeneration) return false
      error.value = (err as Error).message
      console.error('Error fetching code snippets:', err)
      return false
    } finally {
      if (request === fetchCodeSnippetsGeneration) isLoading.value = false
    }
  }

  const addCodeSnippet = async (snippet: Omit<CodeSnippet, 'id' | 'createdAt' | 'updatedAt'>) => {
    isLoading.value = true
    error.value = null
    try {
      const userId = await getCurrentUserId()
      const { data, error: err } = await supabase
        .from('code_snippets')
        .insert([{ created_by: userId, title: snippet.title, language: snippet.language, code: snippet.code }])
        .select()

      if (err) throw err

      const record = data && Array.isArray(data) ? data[0] : data;
      if (record && record.id) {
        codeSnippets.value.unshift({
          version: record.version,
          id: record.id,
          title: record.title || 'Untitled snippet',
          language: record.language || 'plaintext',
          code: record.code || '',
          createdAt: record.created_at,
          updatedAt: record.updated_at
        })
      } else {
        await fetchCodeSnippets()
      }

      return { success: true }
    } catch (err) {
      error.value = (err as Error).message
      console.error('Error adding code snippet:', err)
      return { success: false, message: error.value || 'Failed to add code snippet' }
    } finally {
      isLoading.value = false
    }
  }

  const updateCodeSnippet = async (
    id: string,
    updates: Partial<Pick<CodeSnippet, 'title' | 'language' | 'code' | 'version'>>
  ) => {
    isLoading.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase
        .from('code_snippets')
        .update({
          ...(updates.version === undefined ? {} : { version: updates.version }),
          title: updates.title,
          language: updates.language,
          code: updates.code,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single()

      if (err) throw err

      const index = codeSnippets.value.findIndex(snippet => snippet.id === id)
      if (index !== -1) {
        codeSnippets.value[index] = {
          version: data.version,
          id: data.id,
          title: data.title || 'Untitled snippet',
          language: data.language || 'plaintext',
          code: data.code || '',
          createdAt: data.created_at,
          updatedAt: data.updated_at
        }
      }

      return { success: true }
    } catch (err) {
      error.value = (err as Error).message
      console.error('Error updating code snippet:', err)
      return { success: false, message: error.value || 'Failed to update code snippet' }
    } finally {
      isLoading.value = false
    }
  }

  const deleteCodeSnippet = async (id: string) => {
    isLoading.value = true
    error.value = null
    try {
      const { error: err } = await supabase
        .from('code_snippets')
        .delete()
        .eq('id', id)

      if (err) throw err
      codeSnippets.value = codeSnippets.value.filter(snippet => snippet.id !== id)
      return { success: true }
    } catch (err) {
      error.value = (err as Error).message
      console.error('Error deleting code snippet:', err)
      return { success: false, message: error.value || 'Failed to delete code snippet' }
    } finally {
      isLoading.value = false
    }
  }

  supabase.listen({ categories: fetchCategories, todos: fetchTodos, quick_notes: fetchQuickNotes, code_snippets: fetchCodeSnippets }, () => isLoading.value)

  return {
    todos,
    categories,
    quickNotes,
    codeSnippets,
    isLoading,
    error,
    fetchCategories,
    fetchTodos,
    fetchQuickNotes,
    fetchCodeSnippets,
    addTodo,
    toggleTodo,
    deleteTodo,
    editTodo,
    updateTodo,
    addCategory,
    deleteCategory,
    editCategory,
    reorderTodos,
    getTodosInCategory,
    addQuickNote,
    deleteQuickNote,
    toggleQuickNote,
    addCodeSnippet,
    updateCodeSnippet,
    deleteCodeSnippet,
  }
})
