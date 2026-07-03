<?php

namespace App\Http\Requests;

use App\Support\FaultRegistry;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Unique;

class StoreTodoRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return $this->applyFaults([
            'contact_email' => ['required', 'email', 'max:255', 'unique:todos,contact_email', 'confirmed'],
            'title' => ['required', 'string', 'max:255'],
            'status' => ['required', 'in:open,doing,done'],
            'body' => ['nullable', 'string'],
            'due_date' => ['nullable', 'date'],
            'done' => ['nullable', 'boolean'],
        ]);
    }

    /**
     * Eval-only: when a seeded validation fault is active, drop the targeted rule so the matching
     * negative test can detect the regression (TathyaTest fault-injection / RQ3).
     */
    protected function applyFaults(array $rules): array
    {
        if (FaultRegistry::is('validation_title_required')) {
            // Dropping `required` alone is unobservable: the empty string arrives as null
            // (ConvertEmptyStringsToNull) and the remaining `string` rule still rejects it.
            // The realistic regression makes the field optional.
            $rules['title'] = array_merge(['nullable'], self::without($rules['title'], ['required']));
        }
        if (FaultRegistry::is('validation_email_format')) {
            $rules['contact_email'] = self::without($rules['contact_email'], ['email']);
        }
        if (FaultRegistry::is('validation_confirmation_drop')) {
            $rules['contact_email'] = self::without($rules['contact_email'], ['confirmed']);
        }
        if (FaultRegistry::is('validation_maxlength_drop')) {
            $rules['title'] = self::without($rules['title'], ['max:255']);
            $rules['contact_email'] = self::without($rules['contact_email'], ['max:255']);
        }
        if (FaultRegistry::is('validation_unique_drop')) {
            $rules['contact_email'] = array_values(array_filter(
                $rules['contact_email'],
                fn ($rule) => ! ($rule instanceof Unique) && ! (is_string($rule) && str_starts_with($rule, 'unique')),
            ));
        }

        return $rules;
    }

    private static function without(array $rules, array $remove): array
    {
        return array_values(array_filter(
            $rules,
            fn ($rule) => ! (is_string($rule) && in_array($rule, $remove, true)),
        ));
    }
}
