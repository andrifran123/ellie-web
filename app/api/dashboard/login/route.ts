import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();

    if (!password) {
      return NextResponse.json(
        { error: 'Password is required' },
        { status: 400 }
      );
    }

    // Get the admin password from environment variables
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
      console.error('❌ ADMIN_PASSWORD not configured in environment variables');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Check if password matches
    if (password !== adminPassword) {
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      );
    }

    // Hash the admin password to use as the auth token
    const authToken = crypto
      .createHash('sha256')
      .update(adminPassword)
      .digest('hex');

    // Set the auth cookie
    const cookieStore = await cookies();
    cookieStore.set('admin_auth', authToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    return NextResponse.json(
      { success: true, message: 'Login successful' },
      { status: 200 }
    );

  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Login failed' },
      { status: 500 }
    );
  }
}