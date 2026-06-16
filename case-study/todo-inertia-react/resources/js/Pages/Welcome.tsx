import { PageProps } from '@/types';
import { Head, Link } from '@inertiajs/react';

export default function Welcome({ auth }: PageProps) {
    return (
        <>
            <Head title="Tathya Todo React" />
            <main className="min-h-screen bg-gray-50 px-6 py-10 text-gray-900">
                <div className="mx-auto max-w-4xl">
                    <nav className="mb-10 flex justify-end gap-4">
                        {auth.user ? (
                            <Link href={route('dashboard')} className="font-medium text-indigo-700">
                                Dashboard
                            </Link>
                        ) : (
                            <Link href={route('login')} className="font-medium text-indigo-700">
                                Log in
                            </Link>
                        )}
                    </nav>

                    <section className="space-y-4">
                        <h1 className="text-3xl font-semibold">Tathya Todo React</h1>
                        <p className="max-w-2xl text-gray-700">
                            Inertia and React implementation of the Todo case study for rendered
                            crawler coverage.
                        </p>
                        <a href="/todos" className="inline-block font-medium text-indigo-700">
                            Open todos
                        </a>
                    </section>
                </div>
            </main>
        </>
    );
}
