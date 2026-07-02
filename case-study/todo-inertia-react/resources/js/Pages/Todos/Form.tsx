import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';
import PrimaryButton from '@/Components/PrimaryButton';
import TextInput from '@/Components/TextInput';

export type TodoFormValue = {
    id?: number;
    title?: string;
    contact_email?: string;
    status?: string;
    body?: string | null;
    due_date?: string | null;
    done?: boolean;
};

type Errors = Partial<Record<keyof TodoFormValue | 'contact_email_confirmation', string>>;

export default function TodoForm({
    action,
    csrfToken,
    methodOverride,
    todo,
    submitText,
    errors = {},
}: {
    action: string;
    csrfToken: string;
    methodOverride?: 'PUT';
    todo?: TodoFormValue;
    submitText: string;
    errors?: Errors;
}) {
    const contactEmail = todo?.contact_email ?? '';

    return (
        <form method="POST" action={action} noValidate className="space-y-4">
            <input type="hidden" name="_token" value={csrfToken} />
            {methodOverride && (
                <input type="hidden" name="_method" value={methodOverride} />
            )}

            <div>
                <InputLabel htmlFor="contact_email" value="Contact email" />
                <TextInput
                    id="contact_email"
                    name="contact_email"
                    type="email"
                    required
                    maxLength={255}
                    defaultValue={contactEmail}
                    className="mt-1 block w-full"
                />
                <InputError message={errors.contact_email} className="mt-2" />
            </div>

            <div>
                <InputLabel htmlFor="contact_email_confirmation" value="Confirm contact email" />
                <TextInput
                    id="contact_email_confirmation"
                    name="contact_email_confirmation"
                    type="email"
                    required
                    maxLength={255}
                    defaultValue={contactEmail}
                    className="mt-1 block w-full"
                />
                <InputError message={errors.contact_email_confirmation} className="mt-2" />
            </div>

            <div>
                <InputLabel htmlFor="title" value="Title" />
                <TextInput
                    id="title"
                    name="title"
                    type="text"
                    required
                    maxLength={255}
                    defaultValue={todo?.title ?? ''}
                    className="mt-1 block w-full"
                />
                <InputError message={errors.title} className="mt-2" />
            </div>

            <div>
                <InputLabel htmlFor="status" value="Status" />
                <select
                    id="status"
                    name="status"
                    required
                    defaultValue={todo?.status ?? 'open'}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                >
                    <option value="open">Open</option>
                    <option value="doing">Doing</option>
                    <option value="done">Done</option>
                </select>
                <InputError message={errors.status} className="mt-2" />
            </div>

            <div>
                <InputLabel htmlFor="body" value="Body" />
                <textarea
                    id="body"
                    name="body"
                    defaultValue={todo?.body ?? ''}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                />
                <InputError message={errors.body} className="mt-2" />
            </div>

            <div>
                <InputLabel htmlFor="due_date" value="Due date" />
                <TextInput
                    id="due_date"
                    name="due_date"
                    type="date"
                    defaultValue={todo?.due_date ?? ''}
                    className="mt-1 block w-full"
                />
                <InputError message={errors.due_date} className="mt-2" />
            </div>

            <label className="flex items-center gap-2">
                <input
                    name="done"
                    type="checkbox"
                    value="1"
                    defaultChecked={todo?.done ?? false}
                    className="rounded border-gray-300 text-indigo-600 shadow-sm focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-700">Done</span>
            </label>
            <InputError message={errors.done} className="mt-2" />

            <PrimaryButton>{submitText}</PrimaryButton>
        </form>
    );
}
