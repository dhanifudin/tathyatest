<x-app-layout>
    <x-slot name="header">
        <div class="flex items-center justify-between">
            <h1 class="text-xl font-semibold leading-tight text-gray-800">
                Todos
            </h1>
            <a href="/todos/create" class="text-sm font-medium text-indigo-700 hover:text-indigo-900">
                New todo
            </a>
        </div>
    </x-slot>

    <div class="py-12">
        <div class="mx-auto max-w-7xl sm:px-6 lg:px-8">
            <form method="GET" action="/todos" class="mb-6 grid gap-4 rounded-lg bg-white p-4 shadow-sm sm:grid-cols-[1fr_180px_auto] sm:items-end">
                <div>
                    <x-input-label for="search" :value="__('Search todos')" />
                    <x-text-input id="search" name="search" type="search" maxlength="255" :value="$filters['search']" placeholder="Title, body, or email" class="mt-1 block w-full" />
                </div>
                <div>
                    <x-input-label for="status" :value="__('Filter')" />
                    <select id="status" name="status" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                        <option value="all" @selected($filters['status'] === 'all')>All</option>
                        <option value="undone" @selected($filters['status'] === 'undone')>Undone</option>
                        <option value="done" @selected($filters['status'] === 'done')>Done</option>
                    </select>
                </div>
                <div class="flex gap-2">
                    <x-primary-button type="submit">Apply</x-primary-button>
                    <a href="/todos" class="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-widest text-gray-700 shadow-sm transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">Reset</a>
                </div>
            </form>

            <div class="overflow-hidden bg-white shadow-sm sm:rounded-lg">
                <table class="w-full border-collapse text-left">
                    <thead>
                        <tr>
                            <th class="border-b px-6 py-3">Title</th>
                            <th class="border-b px-6 py-3">Due date</th>
                            <th class="border-b px-6 py-3">Done</th>
                            <th class="border-b px-6 py-3">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                    @forelse ($todos as $todo)
                        <tr>
                            <td class="border-b px-6 py-4">{{ $todo->title }}</td>
                            <td class="border-b px-6 py-4">{{ optional($todo->due_date)->format('Y-m-d') }}</td>
                            <td class="border-b px-6 py-4">{{ $todo->done ? 'Yes' : 'No' }}</td>
                            <td class="border-b px-6 py-4">
                                <form method="POST" action="/todos/{{ $todo->id }}/toggle" class="mr-4 inline">
                                    @csrf
                                    @method('PUT')
                                    <button type="submit" class="text-green-700 hover:text-green-900">{{ $todo->done ? 'Mark undone' : 'Mark done' }}</button>
                                </form>
                                <a href="/todos/{{ $todo->id }}/edit" class="mr-4 text-indigo-700 hover:text-indigo-900">Edit</a>
                                <form method="POST" action="/todos/{{ $todo->id }}" class="inline">
                                    @csrf
                                    @method('DELETE')
                                    <button type="submit" class="text-red-700 hover:text-red-900">Delete</button>
                                </form>
                            </td>
                        </tr>
                    @empty
                        <tr>
                            <td colspan="4" class="px-6 py-8 text-center text-gray-500">No todos found.</td>
                        </tr>
                    @endforelse
                    </tbody>
                </table>
            </div>

            <div class="mt-6">
                {{ $todos->links() }}
            </div>
        </div>
    </div>
</x-app-layout>
