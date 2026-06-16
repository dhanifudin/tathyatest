import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { PageProps } from '@/types';
import { Head, Link } from '@inertiajs/react';

type Todo = {
    id: number;
    title: string;
    due_date: string | null;
    done: boolean;
    user?: { name: string; email: string } | null;
};

export default function Index({
    auth,
    csrfToken,
    todos,
}: PageProps<{ todos: Todo[] }>) {
    return (
        <AuthenticatedLayout
            header={
                <div className="flex items-center justify-between">
                    <h1 className="text-xl font-semibold leading-tight text-gray-800">Todos</h1>
                    <a href="/todos/create" className="text-sm font-medium text-indigo-700 hover:text-indigo-900">
                        New todo
                    </a>
                </div>
            }
        >
            <Head title="Todos" />
            <div className="py-12">
                <div className="mx-auto max-w-7xl sm:px-6 lg:px-8">
                    <div className="overflow-hidden bg-white shadow-sm sm:rounded-lg">
                        <table className="w-full border-collapse text-left">
                            <thead>
                                <tr>
                                    <th className="border-b px-6 py-3">Title</th>
                                    <th className="border-b px-6 py-3">Due date</th>
                                    <th className="border-b px-6 py-3">Done</th>
                                    <th className="border-b px-6 py-3">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {todos.map((todo) => (
                                    <tr key={todo.id}>
                                        <td className="border-b px-6 py-4">{todo.title}</td>
                                        <td className="border-b px-6 py-4">{todo.due_date ?? ''}</td>
                                        <td className="border-b px-6 py-4">{todo.done ? 'Yes' : 'No'}</td>
                                        <td className="border-b px-6 py-4">
                                            <a href={`/todos/${todo.id}/edit`} className="mr-4 text-indigo-700 hover:text-indigo-900">
                                                Edit
                                            </a>
                                            <form method="POST" action={`/todos/${todo.id}`} className="inline">
                                                <input type="hidden" name="_token" value={csrfToken} />
                                                <input type="hidden" name="_method" value="DELETE" />
                                                <button type="submit" className="text-red-700 hover:text-red-900">
                                                    Delete
                                                </button>
                                            </form>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
