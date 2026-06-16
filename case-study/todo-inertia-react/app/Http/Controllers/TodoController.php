<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreTodoRequest;
use App\Http\Requests\UpdateTodoRequest;
use App\Models\Todo;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

class TodoController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('Todos/Index', [
            'todos' => auth()->user()->isAdmin()
                ? Todo::with('user')->latest()->get()->map(fn (Todo $todo): array => $this->serializeTodo($todo))
                : auth()->user()->todos()->latest()->get()->map(fn (Todo $todo): array => $this->serializeTodo($todo)),
        ]);
    }

    public function create(): Response
    {
        return Inertia::render('Todos/Create');
    }

    public function store(StoreTodoRequest $request): RedirectResponse
    {
        auth()->user()->todos()->create($request->validated() + ['done' => $request->boolean('done')]);

        return redirect('/todos');
    }

    public function edit(Todo $todo): Response
    {
        $this->authorizeTodo($todo);

        return Inertia::render('Todos/Edit', ['todo' => $this->serializeTodo($todo)]);
    }

    public function update(UpdateTodoRequest $request, Todo $todo): RedirectResponse
    {
        $this->authorizeTodo($todo);
        $todo->update($request->validated() + ['done' => $request->boolean('done')]);

        return redirect('/todos');
    }

    public function destroy(Todo $todo): RedirectResponse
    {
        $this->authorizeTodo($todo);
        $todo->delete();

        return redirect('/todos');
    }

    private function authorizeTodo(Todo $todo): void
    {
        abort_unless(auth()->user()->isAdmin() || $todo->user_id === auth()->id(), 403);
    }

    private function serializeTodo(Todo $todo): array
    {
        return [
            'id' => $todo->id,
            'title' => $todo->title,
            'contact_email' => $todo->contact_email,
            'status' => $todo->status,
            'body' => $todo->body,
            'due_date' => optional($todo->due_date)->format('Y-m-d'),
            'done' => $todo->done,
            'user' => $todo->relationLoaded('user') && $todo->user ? [
                'name' => $todo->user->name,
                'email' => $todo->user->email,
            ] : null,
        ];
    }
}
