export interface Todo {
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
