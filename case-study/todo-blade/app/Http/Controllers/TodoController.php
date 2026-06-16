<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreTodoRequest;
use App\Http\Requests\UpdateTodoRequest;
use App\Models\Todo;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\View\View;

class TodoController extends Controller
{
    public function index(Request $request): View
    {
        $filters = $request->validate([
            'search' => ['nullable', 'string', 'max:255'],
            'status' => ['nullable', 'in:all,done,undone'],
        ]);

        $query = auth()->user()->isAdmin()
            ? Todo::with('user')
            : auth()->user()->todos();

        $query
            ->when($filters['search'] ?? null, function ($query, string $search): void {
                $query->where(function ($query) use ($search): void {
                    $query
                        ->where('title', 'like', "%{$search}%")
                        ->orWhere('body', 'like', "%{$search}%")
                        ->orWhere('contact_email', 'like', "%{$search}%");
                });
            })
            ->when(($filters['status'] ?? 'all') === 'done', fn ($query) => $query->where('done', true))
            ->when(($filters['status'] ?? 'all') === 'undone', fn ($query) => $query->where('done', false));

        return view('todos.index', [
            'filters' => [
                'search' => $filters['search'] ?? '',
                'status' => $filters['status'] ?? 'all',
            ],
            'todos' => $query->latest()->paginate(10)->withQueryString(),
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

    public function toggle(Todo $todo): RedirectResponse
    {
        $this->authorizeTodo($todo);
        $todo->update(['done' => ! $todo->done]);

        return back();
    }

    private function authorizeTodo(Todo $todo): void
    {
        abort_unless(auth()->user()->isAdmin() || $todo->user_id === auth()->id(), 403);
    }
}
