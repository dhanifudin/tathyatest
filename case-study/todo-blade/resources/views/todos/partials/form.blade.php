<div>
    <x-input-label for="contact_email" :value="__('Contact email')" />
    <x-text-input id="contact_email" name="contact_email" type="email" required maxlength="255" :value="old('contact_email', $todo?->contact_email)" class="mt-1 block w-full" />
    <x-input-error :messages="$errors->get('contact_email')" class="mt-2" />
</div>

<div>
    <x-input-label for="contact_email_confirmation" :value="__('Confirm contact email')" />
    <x-text-input id="contact_email_confirmation" name="contact_email_confirmation" type="email" required maxlength="255" :value="old('contact_email_confirmation', $todo?->contact_email)" class="mt-1 block w-full" />
    <x-input-error :messages="$errors->get('contact_email_confirmation')" class="mt-2" />
</div>

<div>
    <x-input-label for="title" :value="__('Title')" />
    <x-text-input id="title" name="title" type="text" required maxlength="255" :value="old('title', $todo?->title)" class="mt-1 block w-full" />
    <x-input-error :messages="$errors->get('title')" class="mt-2" />
</div>

<div>
    <x-input-label for="status" :value="__('Status')" />
    <select id="status" name="status" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
        <option value="open" @selected(old('status', $todo?->status) === 'open')>Open</option>
        <option value="doing" @selected(old('status', $todo?->status) === 'doing')>Doing</option>
        <option value="done" @selected(old('status', $todo?->status) === 'done')>Done</option>
    </select>
    <x-input-error :messages="$errors->get('status')" class="mt-2" />
</div>

<div>
    <x-input-label for="body" :value="__('Body')" />
    <textarea id="body" name="body" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">{{ old('body', $todo?->body) }}</textarea>
    <x-input-error :messages="$errors->get('body')" class="mt-2" />
</div>

<div>
    <x-input-label for="due_date" :value="__('Due date')" />
    <x-text-input id="due_date" name="due_date" type="date" :value="old('due_date', optional($todo?->due_date)->format('Y-m-d'))" class="mt-1 block w-full" />
    <x-input-error :messages="$errors->get('due_date')" class="mt-2" />
</div>

<div>
    <label class="flex items-center gap-2">
        <input name="done" type="checkbox" value="1" @checked(old('done', $todo?->done)) class="rounded border-gray-300 text-indigo-600 shadow-sm focus:ring-indigo-500">
        <span class="text-sm text-gray-700">Done</span>
    </label>
    <x-input-error :messages="$errors->get('done')" class="mt-2" />
</div>
