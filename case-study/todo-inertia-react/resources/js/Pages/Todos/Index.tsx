import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { PageProps } from '@/types';
import PrimaryButton from '@/Components/PrimaryButton';
import TextInput from '@/Components/TextInput';
import { Head } from '@inertiajs/react';

type Todo = {
    id: number;
    title: string;
    due_date: string | null;
    done: boolean;
    user?: { name: string; email: string } | null;
};

type PaginationLink = {
    url: string | null;
    label: string;
    active: boolean;
};

type PaginatedTodos = {
    data: Todo[];
    links: PaginationLink[];
    from: number | null;
    to: number | null;
    total: number;
};

type Filters = {
    search: string;
    status: 'all' | 'done' | 'undone';
};

export default function Index({
    auth,
    csrfToken,
    filters,
    todos,
}: PageProps<{ filters: Filters; todos: PaginatedTodos }>) {
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
                    <form method="GET" action="/todos" className="mb-6 grid gap-4 rounded-lg bg-white p-4 shadow-sm sm:grid-cols-[1fr_180px_auto] sm:items-end">
                        <div>
                            <label htmlFor="search" className="block text-sm font-medium text-gray-700">
                                Search todos
                            </label>
                            <TextInput
                                id="search"
                                name="search"
                                type="search"
                                maxLength={255}
                                defaultValue={filters.search}
                                placeholder="Title, body, or email"
                                className="mt-1 block w-full"
                            />
                        </div>
                        <div>
                            <label htmlFor="status" className="block text-sm font-medium text-gray-700">
                                Filter
                            </label>
                            <select
                                id="status"
                                name="status"
                                defaultValue={filters.status}
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                            >
                                <option value="all">All</option>
                                <option value="undone">Undone</option>
                                <option value="done">Done</option>
                            </select>
                        </div>
                        <div className="flex gap-2">
                            <PrimaryButton type="submit">Apply</PrimaryButton>
                            <a href="/todos" className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-widest text-gray-700 shadow-sm transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
                                Reset
                            </a>
                        </div>
                    </form>

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
                                {todos.data.map((todo) => (
                                    <tr key={todo.id}>
                                        <td className="border-b px-6 py-4">{todo.title}</td>
                                        <td className="border-b px-6 py-4">{todo.due_date ?? ''}</td>
                                        <td className="border-b px-6 py-4">{todo.done ? 'Yes' : 'No'}</td>
                                        <td className="border-b px-6 py-4">
                                            <form method="POST" action={`/todos/${todo.id}/toggle`} className="mr-4 inline">
                                                <input type="hidden" name="_token" value={csrfToken} />
                                                <input type="hidden" name="_method" value="PUT" />
                                                <button type="submit" className="text-green-700 hover:text-green-900">
                                                    {todo.done ? 'Mark undone' : 'Mark done'}
                                                </button>
                                            </form>
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
                                {todos.data.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                                            No todos found.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm text-gray-600">
                            {todos.from && todos.to ? `Showing ${todos.from}-${todos.to} of ${todos.total}` : 'No results'}
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {todos.links.map((link) => (
                                link.url ? (
                                    <a
                                        key={`${link.label}-${link.url}`}
                                        href={link.url}
                                        className={`rounded-md border px-3 py-2 text-sm ${link.active ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
                                    >
                                        {link.label.replace('&laquo;', 'Previous').replace('&raquo;', 'Next')}
                                    </a>
                                ) : (
                                    <span key={link.label} className="rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-400">
                                        {link.label.replace('&laquo;', 'Previous').replace('&raquo;', 'Next')}
                                    </span>
                                )
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
