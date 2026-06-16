<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\View\View;

class AdminUserController extends Controller
{
    public function __invoke(): View
    {
        return view('admin.users', ['users' => User::orderBy('email')->get()]);
    }
}
