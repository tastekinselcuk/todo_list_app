import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from './auth'

export type Priority = 'low' | 'medium' | 'high'

// Helper: Get current user ID from auth store
const getCurrentUserId = async (): Promise<string | null> => {
  const authStore = useAuthStore()
  // Auth store'dan user alır, eğer null ise await getCurrentUser() çağırır
  if (authStore.user?.id) {
    return authStore.user.id
  }
  
  try {
    const { data: { user } } = await supabase.auth.getUser()
    return user?.id || null
  } catch (err) {
    console.error('Error getting current user:', err)
    return null
  }
}

export interface Todo {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  categoryId: string;
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

const defaultCategories: Category[] = [
  { id: '1', name: 'Work', color: '#EF4444', icon: 'briefcase' },
  { id: '2', name: 'Personal', color: '#3B82F6', icon: 'user' },
  { id: '3', name: 'Shopping', color: '#10B981', icon: 'shopping-bag' },
  { id: '4', name: 'Fitness', color: '#F59E0B', icon: 'dumbbell' },
]

const STORAGE_KEY = 'todo-app-data'

export const useTodoStore = defineStore('todo', () => {
  // Load initial data from localStorage (fallback)
  const savedData = localStorage.getItem(STORAGE_KEY)
  const initialData = savedData ? JSON.parse(savedData) : {
    todos: [],
    categories: defaultCategories
  }

  const todos = ref<Todo[]>(initialData.todos)
  const categories = ref<Category[]>(initialData.categories)
  const quickNotes = ref<QuickNote[]>(initialData.quickNotes || [])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Watch for changes and save to localStorage (fallback)
  watch(
    [todos, categories, quickNotes],
    () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        todos: todos.value,
        categories: categories.value,
        quickNotes: quickNotes.value
      }))
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
      categories.value = (data || []).map(cat => ({
        id: cat.id,
        name: cat.name,
        color: cat.color || '#3B82F6',
        icon: cat.icon || 'folder'
      }))
    } catch (err) {
      error.value = (err as Error).message
      console.error('Error fetching categories:', err)
    } finally {
      isLoading.value = false
    }
  }

  const addCategory = async (category: Omit<Category, 'id'>) => {
    isLoading.value = true
    error.value = null
    try {
      // Check for duplicate names first
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
        .insert([
          {
            created_by: userId,
            name: category.name,
            color: category.color,
            icon: category.icon
          }
        ])
        .select()
      
      if (err) throw err
      
      if (data && data[0]) {
        categories.value.unshift({
          id: data[0].id,
          name: data[0].name,
          color: data[0].color,
          icon: data[0].icon
        })
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
      // Check for duplicate names if updating name
      if (updates.name) {
        const existing = categories.value.find(c => 
          c.name.toLowerCase().trim() === updates.name!.toLowerCase().trim() &&
          c.id !== id
        )
        if (existing) {
          error.value = `A category with the name "${updates.name}" already exists.`
          return { success: false, message: error.value }
        }
      }

      const { error: err } = await supabase
        .from('categories')
        .update({
          name: updates.name,
          color: updates.color,
          icon: updates.icon
        })
        .eq('id', id)
      
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

      const { error: err } = await supabase
        .from('categories')
        .delete()
        .eq('id', id)
      
      if (err) throw err
      
      categories.value = categories.value.filter(c => c.id !== id)
      todos.value = todos.value.filter(t => t.categoryId !== id)
      
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
  const fetchTodos = async () => {
    isLoading.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase
        .from('todos')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (err) throw err
      todos.value = (data || []).map(todo => ({
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
    } catch (err) {
      error.value = (err as Error).message
      console.error('Error fetching todos:', err)
    } finally {
      isLoading.value = false
    }
  }

  const addTodo = async (todo: Omit<Todo, 'id' | 'createdAt' | 'updatedAt'>) => {
    isLoading.value = true
    error.value = null
    try {
      const userId = await getCurrentUserId()
      const { data, error: err } = await supabase
        .from('todos')
        .insert([
          {
            created_by: userId,
            title: todo.title,
            description: todo.description,
            completed: todo.completed,
            category_id: todo.categoryId,
            priority: todo.priority,
            due_date: todo.dueDate
          }
        ])
        .select()
      
      if (err) throw err
      
      if (data && data[0]) {
        const newTodo = {
          id: data[0].id,
          title: data[0].title,
          description: data[0].description || '',
          completed: data[0].completed,
          categoryId: data[0].category_id || '',
          priority: data[0].priority,
          dueDate: data[0].due_date || null,
          createdAt: data[0].created_at,
          updatedAt: data[0].updated_at
        }
        todos.value.unshift(newTodo)
      }
    } catch (err) {
      error.value = (err as Error).message
      console.error('Error adding todo:', err)
    } finally {
      isLoading.value = false
    }
  }

  const toggleTodo = async (id: string) => {
    isLoading.value = true
    try {
      const todo = todos.value.find(t => t.id === id)
      if (!todo) return
      
      const { error: err } = await supabase
        .from('todos')
        .update({ completed: !todo.completed })
        .eq('id', id)
      
      if (err) throw err
      todo.completed = !todo.completed
    } catch (err) {
      error.value = (err as Error).message
      console.error('Error toggling todo:', err)
    } finally {
      isLoading.value = false
    }
  }

  const updateTodo = async (updatedTodo: Todo) => {
    isLoading.value = true
    error.value = null
    try {
      const { error: err } = await supabase
        .from('todos')
        .update({
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
        todos.value[index] = updatedTodo
      }
    } catch (err) {
      error.value = (err as Error).message
      console.error('Error updating todo:', err)
    } finally {
      isLoading.value = false
    }
  }

  const deleteTodo = async (id: string) => {
    isLoading.value = true
    error.value = null
    try {
      const { error: err } = await supabase
        .from('todos')
        .delete()
        .eq('id', id)
      
      if (err) throw err
      
      todos.value = todos.value.filter(t => t.id !== id)
    } catch (err) {
      error.value = (err as Error).message
      console.error('Error deleting todo:', err)
    } finally {
      isLoading.value = false
    }
  }

  const editTodo = (id: string, updates: Partial<Todo>) => {
    const todo = todos.value.find(t => t.id === id)
    if (todo) {
      Object.assign(todo, updates)
    }
  }

  const reorderTodos = (newOrder: Todo[]) => {
    todos.value = [...newOrder]
  }

  // ===== QUICK NOTES OPERATIONS =====
  const fetchQuickNotes = async () => {
    isLoading.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase
        .from('quick_notes')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (err) throw err
      quickNotes.value = (data || []).map(note => ({
        id: note.id,
        content: note.content,
        createdAt: note.created_at,
        completed: note.completed || false
      }))
    } catch (err) {
      error.value = (err as Error).message
      console.error('Error fetching quick notes:', err)
    } finally {
      isLoading.value = false
    }
  }

  const addQuickNote = async (content: string) => {
    isLoading.value = true
    error.value = null
    try {
      const userId = await getCurrentUserId()
      const { data, error: err } = await supabase
        .from('quick_notes')
        .insert([
          {
            created_by: userId,
            content,
            completed: false
          }
        ])
        .select()
      
      if (err) throw err
      
      if (data && data[0]) {
        const newNote: QuickNote = {
          id: data[0].id,
          content: data[0].content,
          createdAt: data[0].created_at,
          completed: false
        }
        quickNotes.value.unshift(newNote)
      }
    } catch (err) {
      error.value = (err as Error).message
      console.error('Error adding quick note:', err)
    } finally {
      isLoading.value = false
    }
  }

  const toggleQuickNote = async (id: string) => {
    isLoading.value = true
    try {
      const note = quickNotes.value.find(n => n.id === id)
      if (!note) return
      
      const { error: err } = await supabase
        .from('quick_notes')
        .update({ completed: !note.completed })
        .eq('id', id)
      
      if (err) throw err
      note.completed = !note.completed
    } catch (err) {
      error.value = (err as Error).message
      console.error('Error toggling quick note:', err)
    } finally {
      isLoading.value = false
    }
  }

  const deleteQuickNote = async (id: string) => {
    isLoading.value = true
    error.value = null
    try {
      const { error: err } = await supabase
        .from('quick_notes')
        .delete()
        .eq('id', id)
      
      if (err) throw err
      
      quickNotes.value = quickNotes.value.filter(note => note.id !== id)
    } catch (err) {
      error.value = (err as Error).message
      console.error('Error deleting quick note:', err)
    } finally {
      isLoading.value = false
    }
  }

  return {
    todos,
    categories,
    quickNotes,
    isLoading,
    error,
    fetchCategories,
    fetchTodos,
    fetchQuickNotes,
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
  }
})