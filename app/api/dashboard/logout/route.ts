import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST() {
  try {
    // Clear the auth cookie
    const cookieStore = await cookies();
    cookieStore.delete('admin_auth');

    // Clear the environment token
    delete process.env.ADMIN_AUTH_TOKEN;

    return NextResponse.json(
      { success: true, message: 'Logged out successfully' },
      { status: 200 }
    );

  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Logout failed' },
      { status: 500 }
    );
  }
}