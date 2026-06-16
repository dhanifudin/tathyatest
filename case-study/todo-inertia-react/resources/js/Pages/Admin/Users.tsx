import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { PageProps } from '@/types';
import { Head } from '@inertiajs/react';

type UserRow = {
    name: string;
    email: string;
    role: string;
};

export default function Users({ users }: PageProps<{ users: UserRow[] }>) {
    return (
        <AuthenticatedLayout
            header={<h1 className="text-xl font-semibold leading-tight text-gray-800">Admin Users</h1>}
        >
            <Head title="Admin Users" />
            <div className="py-12">
                <div className="mx-auto max-w-5xl sm:px-6 lg:px-8">
                    <div className="overflow-hidden bg-white shadow-sm sm:rounded-lg">
                        <table className="w-full border-collapse text-left">
                            <thead>
                                <tr>
                                    <th className="border-b px-6 py-3">Name</th>
                                    <th className="border-b px-6 py-3">Email</th>
                                    <th className="border-b px-6 py-3">Role</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((user) => (
                                    <tr key={user.email}>
                                        <td className="border-b px-6 py-4">{user.name}</td>
                                        <td className="border-b px-6 py-4">{user.email}</td>
                                        <td className="border-b px-6 py-4">{user.role}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
