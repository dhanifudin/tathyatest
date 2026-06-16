<x-app-layout>
    <x-slot name="header">
        <h1 class="text-xl font-semibold leading-tight text-gray-800">
            Edit Todo
        </h1>
    </x-slot>

    <div class="py-12">
        <div class="mx-auto max-w-3xl sm:px-6 lg:px-8">
            <div class="overflow-hidden bg-white p-6 shadow-sm sm:rounded-lg">
                <form method="POST" action="/todos/{{ $todo->id }}" novalidate class="space-y-4">
                    @csrf
                    @method('PUT')
                    @include('todos.partials.form', ['todo' => $todo])
                    <x-primary-button>Update</x-primary-button>
                </form>
            </div>
        </div>
    </div>
</x-app-layout>
