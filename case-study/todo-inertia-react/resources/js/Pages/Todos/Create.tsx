import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { PageProps } from '@/types';
import { Head } from '@inertiajs/react';
import TodoForm from './Form';

export default function Create({ csrfToken, errors }: PageProps<{ errors: Record<string, string> }>) {
    return (
        <AuthenticatedLayout
            header={<h1 className="text-xl font-semibold leading-tight text-gray-800">Create Todo</h1>}
        >
            <Head title="Create Todo" />
            <div className="py-12">
                <div className="mx-auto max-w-3xl sm:px-6 lg:px-8">
                    <div className="overflow-hidden bg-white p-6 shadow-sm sm:rounded-lg">
                        <TodoForm
                            action="/todos"
                            csrfToken={csrfToken}
                            submitText="Create"
                            errors={errors}
                        />
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
