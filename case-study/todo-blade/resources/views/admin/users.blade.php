<x-app-layout>
    <x-slot name="header">
        <h1 class="text-xl font-semibold leading-tight text-gray-800">
            Admin Users
        </h1>
    </x-slot>

    <div class="py-12">
        <div class="mx-auto max-w-5xl sm:px-6 lg:px-8">
            <div class="overflow-hidden bg-white shadow-sm sm:rounded-lg">
                <table class="w-full border-collapse text-left">
                    <thead>
                        <tr>
                            <th class="border-b px-6 py-3">Name</th>
                            <th class="border-b px-6 py-3">Email</th>
                            <th class="border-b px-6 py-3">Role</th>
                        </tr>
                    </thead>
                    <tbody>
                    @foreach ($users as $user)
                        <tr>
                            <td class="border-b px-6 py-4">{{ $user->name }}</td>
                            <td class="border-b px-6 py-4">{{ $user->email }}</td>
                            <td class="border-b px-6 py-4">{{ $user->role }}</td>
                        </tr>
                    @endforeach
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</x-app-layout>
