<?php

namespace App\Http\Controllers;

use App\Models\User;
use Inertia\Inertia;
use Inertia\Response;

class AdminUserController extends Controller
{
    public function __invoke(): Response
    {
        return Inertia::render('Admin/Users', [
            'users' => User::orderBy('email')->get(['name', 'email', 'role']),
        ]);
    }
}
