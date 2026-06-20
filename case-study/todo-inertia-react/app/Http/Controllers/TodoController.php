<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreTodoRequest;
use App\Http\Requests\UpdateTodoRequest;
use App\Models\Todo;
use App\Support\FaultRegistry;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class TodoController extends Controller
{
    public function index(Request $request): Response
    {
        // Eval-only pagination fault: error out beyond the first page so pagination tests fail.
        abort_if(FaultRegistry::is('pagination_off_by_one') && (int) $request->query('page', '1') > 1, 500);

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

        return Inertia::render('Todos/Index', [
            'filters' => [
                'search' => $filters['search'] ?? '',
                'status' => $filters['status'] ?? 'all',
            ],
            'todos' => $query->latest()->paginate(10)->withQueryString()->through(fn (Todo $todo): array => $this->serializeTodo($todo)),
        ]);
    }

    public function create(): Response
    {
        return Inertia::render('Todos/Create');
    }

    public function store(StoreTodoRequest $request): RedirectResponse
    {
        // Eval-only crud fault: skip persistence so the create happy-path assertion fails.
        if (! FaultRegistry::is('crud_skip_persist')) {
            auth()->user()->todos()->create($request->validated() + ['done' => $request->boolean('done')]);
        }

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
        // Eval-only crud fault: skip persistence so the update happy-path assertion fails.
        if (! FaultRegistry::is('crud_skip_persist')) {
            $todo->update($request->validated() + ['done' => $request->boolean('done')]);
        }

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
