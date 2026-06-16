import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { PageProps } from '@/types';
import { Head } from '@inertiajs/react';
import TodoForm, { TodoFormValue } from './Form';

export default function Edit({
    csrfToken,
    errors,
    todo,
}: PageProps<{ errors: Record<string, string>; todo: TodoFormValue }>) {
    return (
        <AuthenticatedLayout
            header={<h1 className="text-xl font-semibold leading-tight text-gray-800">Edit Todo</h1>}
        >
            <Head title="Edit Todo" />
            <div className="py-12">
                <div className="mx-auto max-w-3xl sm:px-6 lg:px-8">
                    <div className="overflow-hidden bg-white p-6 shadow-sm sm:rounded-lg">
                        <TodoForm
                            action={`/todos/${todo.id}`}
                            csrfToken={csrfToken}
                            methodOverride="PUT"
                            todo={todo}
                            submitText="Update"
                            errors={errors}
                        />
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
