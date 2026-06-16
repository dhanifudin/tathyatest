<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreTodoRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'contact_email' => ['required', 'email', 'max:255', 'unique:todos,contact_email', 'confirmed'],
            'title' => ['required', 'string', 'max:255'],
            'status' => ['required', 'in:open,doing,done'],
            'body' => ['nullable', 'string'],
            'due_date' => ['nullable', 'date'],
            'done' => ['nullable', 'boolean'],
        ];
    }
}
