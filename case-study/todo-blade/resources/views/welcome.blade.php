<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>{{ config('app.name', 'Laravel') }}</title>
        @vite(['resources/css/app.css', 'resources/js/app.js'])
    </head>
    <body class="bg-gray-100 font-sans text-gray-900">
        <main class="mx-auto flex min-h-screen max-w-4xl flex-col justify-center px-6">
            <nav class="mb-10 flex justify-end">
                @auth
                    <a href="{{ route('dashboard') }}" class="font-medium text-indigo-700 hover:text-indigo-900">Dashboard</a>
                @else
                    <a href="{{ route('login') }}" class="font-medium text-indigo-700 hover:text-indigo-900">Log in</a>
                @endauth
            </nav>

            <section class="space-y-4">
                <h1 class="text-3xl font-semibold">Tathya Todo Blade</h1>
                <p class="max-w-2xl text-gray-700">
                    Breeze Blade implementation of the Todo case study for static crawler coverage.
                </p>
                <a href="/todos" class="inline-block font-medium text-indigo-700 hover:text-indigo-900">Open todos</a>
            </section>
        </main>
    </body>
</html>
