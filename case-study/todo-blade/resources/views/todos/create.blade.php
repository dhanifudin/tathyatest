<x-app-layout>
    <x-slot name="header">
        <h1 class="text-xl font-semibold leading-tight text-gray-800">
            Create Todo
        </h1>
    </x-slot>

    <div class="py-12">
        <div class="mx-auto max-w-3xl sm:px-6 lg:px-8">
            <div class="overflow-hidden bg-white p-6 shadow-sm sm:rounded-lg">
                <form method="POST" action="/todos" novalidate class="space-y-4">
                    @csrf
                    @include('todos.partials.form', ['todo' => null])
                    <x-primary-button>Create</x-primary-button>
                </form>
            </div>
        </div>
    </div>
</x-app-layout>
