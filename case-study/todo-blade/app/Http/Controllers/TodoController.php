<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreTodoRequest;
use App\Http\Requests\UpdateTodoRequest;
use App\Models\Todo;
use Illuminate\Http\RedirectResponse;
use Illuminate\View\View;

class TodoController extends Controller
{
    public function index(): View
    {
        return view('todos.index', [
            'todos' => auth()->user()->isAdmin()
                ? Todo::with('user')->latest()->get()
                : auth()->user()->todos()->latest()->get(),
        ]);
    }

    public function create(): View
    {
        return view('todos.create');
    }

    public function store(StoreTodoRequest $request): RedirectResponse
    {
        auth()->user()->todos()->create($request->validated() + ['done' => $request->boolean('done')]);

        return redirect('/todos');
    }

    public function edit(Todo $todo): View
    {
        $this->authorizeTodo($todo);

        return view('todos.edit', ['todo' => $todo]);
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
}
