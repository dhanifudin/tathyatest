<?php

namespace App\Http\Requests;

use Illuminate\Validation\Rule;

class UpdateTodoRequest extends StoreTodoRequest
{
    public function rules(): array
    {
        $rules = parent::rules();
        $rules['contact_email'] = [
            'required',
            'email',
            'max:255',
            Rule::unique('todos', 'contact_email')->ignore($this->route('todo')),
            'confirmed',
        ];

        return $rules;
    }
}
