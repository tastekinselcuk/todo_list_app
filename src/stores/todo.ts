import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export type Priority = 'low' | 'medium' | 'high'

export interface Todo {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  categoryId: string;
  priority: 'low' | 'medium' | 'high';
  dueDate: string | null;
}

export interface Category {
  id: string
  name: string
  color: string
  icon: string
}

const defaultCategories: Category[] = [
  { id: '1', name: 'Work', color: '#EF4444', icon: 'briefcase' },
  { id: '2', name: 'Personal', color: '#3B82F6', icon: 'user' },
  { id: '3', name: 'Shopping', color: '#10B981', icon: 'shopping-bag' },
  { id: '4', name: 'Fitness', color: '#F59E0B', icon: 'dumbbell' },
]

const STORAGE_KEY = 'todo-app-data'

export const useTodoStore = defineStore('todo', () => {
  // Load initial data from localStorage
  const savedData = localStorage.getItem(STORAGE_KEY)
  const initialData = savedData ? JSON.parse(savedData) : {
    todos: [],
    categories: defaultCategories
  }

  const todos = ref<Todo[]>(initialData.todos)
  const categories = ref<Category[]>(initialData.categories)

  // Watch for changes and save to localStorage
  watch(
    [todos, categories],
    () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        todos: todos.value,
        categories: categories.value
      }))
    },
    { deep: true }
  )

  const addTodo = (todo: Omit<Todo, 'id'>) => {
    todos.value.push({
      ...todo,
      id: crypto.randomUUID(),
    })
  }

  const toggleTodo = (id: string) => {
    const todo = todos.value.find(t => t.id === id)
    if (todo) {
      todo.completed = !todo.completed
    }
  }

  const deleteTodo = (id: string) => {
    const index = todos.value.findIndex(t => t.id === id)
    if (index !== -1) {
      todos.value.splice(index, 1)
    }
  }

  const editTodo = (id: string, updates: Partial<Todo>) => {
    const todo = todos.value.find(t => t.id === id)
    if (todo) {
      Object.assign(todo, updates)
    }
  }

  const updateTodo = (updatedTodo: Todo) => {
    const index = todos.value.findIndex(t => t.id === updatedTodo.id)
    if (index !== -1) {
      todos.value[index] = updatedTodo
    }
  }

  const reorderTodos = (newOrder: Todo[]) => {
    // Create a new array to ensure reactivity
    todos.value = [...newOrder]
  }

  const addCategory = (category: Omit<Category, 'id'>) => {
    categories.value.push({
      ...category,
      id: crypto.randomUUID(),
    })
  }

  const deleteCategory = (id: string) => {
    const index = categories.value.findIndex(c => c.id === id)
    if (index !== -1) {
      categories.value.splice(index, 1)
    }
  }

  const editCategory = (id: string, updates: Partial<Category>) => {
    const category = categories.value.find(c => c.id === id)
    if (category) {
      Object.assign(category, updates)
    }
  }

  return {
    todos,
    categories,
    addTodo,
    toggleTodo,
    deleteTodo,
    editTodo,
    updateTodo,
    addCategory,
    deleteCategory,
    editCategory,
    reorderTodos, // Add this to the returned object
  }
})