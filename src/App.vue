<template>
  <div class="min-h-screen bg-gray-50 p-8">
    <div class="max-w-4xl mx-auto space-y-8">
      <header class="flex items-center justify-between">
        <h1 class="text-2xl font-bold">
          Pomodoro Todo
        </h1>
        <button
          @click="showAddTodoDialog = true"
          class="px-4 py-2 rounded-md bg-primary text-white hover:bg-primary/90"
        >
          Add Todo
        </button>
      </header>

      <TodoList />
      
      <AddTodoDialog
        v-model:open="showAddTodoDialog"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import TodoList from '@/components/TodoList.vue'
import AddTodoDialog from '@/components/AddTodoDialog.vue'

const showAddTodoDialog = ref(false)
</script>

<style>
body {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
}

.bg-primary {
  background-color: #3b82f6;
}

.text-primary {
  color: #3b82f6;
}

.hover\:bg-primary\/90:hover {
  background-color: rgb(59 130 246 / 0.9);
}

.bg-accent {
  background-color: rgb(243 244 246);
}

.text-accent-foreground {
  color: rgb(17 24 39);
}

.border-input {
  border-color: rgb(229 231 235);
}
</style>
