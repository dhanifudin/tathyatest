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
                    @foreach ($todos as $todo)
                        <tr>
                            <td class="border-b px-6 py-4">{{ $todo->title }}</td>
                            <td class="border-b px-6 py-4">{{ optional($todo->due_date)->format('Y-m-d') }}</td>
                            <td class="border-b px-6 py-4">{{ $todo->done ? 'Yes' : 'No' }}</td>
                            <td class="border-b px-6 py-4">
                                <a href="/todos/{{ $todo->id }}/edit" class="mr-4 text-indigo-700 hover:text-indigo-900">Edit</a>
                                <form method="POST" action="/todos/{{ $todo->id }}" class="inline">
                                    @csrf
                                    @method('DELETE')
                                    <button type="submit" class="text-red-700 hover:text-red-900">Delete</button>
                                </form>
                            </td>
                        </tr>
                    @endforeach
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</x-app-layout>
