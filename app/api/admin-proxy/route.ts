import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';

// Verify admin session before proxying
async function verifyAdminSession(): Promise<boolean> {
  const cookieStore = await cookies();
  const authToken = cookieStore.get('admin_auth')?.value;

  if (!authToken || !process.env.ADMIN_PASSWORD) {
    return false;
  }

  // Verify the token matches the hash of admin password
  const expectedToken = crypto
    .createHash('sha256')
    .update(process.env.ADMIN_PASSWORD)
    .digest('hex');

  return authToken === expectedToken;
}

// Handle all methods (GET, POST, etc.)
export async function GET(request: NextRequest) {
  return handleProxy(request);
}

export async function POST(request: NextRequest) {
  return handleProxy(request);
}

async function handleProxy(request: NextRequest) {
  // Verify admin session
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get the target path from query params
  const { searchParams } = new URL(request.url);
  const targetPath = searchParams.get('path');

  if (!targetPath) {
    return NextResponse.json({ error: 'Missing path parameter' }, { status: 400 });
  }

  // Build the backend URL
  const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.ellie-elite.com';
  const fullUrl = `${backendUrl}${targetPath}`;

  try {
    // Forward the request to the backend with admin key
    const fetchOptions: RequestInit = {
      method: request.method,
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': process.env.ADMIN_API_KEY || '',
      },
    };

    // Include body for POST requests
    if (request.method === 'POST') {
      const body = await request.text();
      if (body) {
        fetchOptions.body = body;
      }
    }

    const response = await fetch(fullUrl, fetchOptions);
    const data = await response.json();

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Admin proxy error:', error);
    return NextResponse.json({ error: 'Proxy request failed' }, { status: 500 });
  }
}
