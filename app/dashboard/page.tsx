import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import crypto from 'crypto';
import RelationshipDashboard from "./RelationshipDashboard";

export const metadata = {
  title: "Analytics Dashboard | Ellie",
  description: "Comprehensive relationship analytics and insights",
};

// Simple authentication check
async function checkAuth() {
  const cookieStore = await cookies();
  const authToken = cookieStore.get('admin_auth')?.value;
  
  if (!authToken) {
    return false;
  }

  // Hash the admin password to compare with cookie
  const adminPassword = process.env.ADMIN_PASSWORD;
  
  if (!adminPassword) {
    return false;
  }

  const expectedToken = crypto
    .createHash('sha256')
    .update(adminPassword)
    .digest('hex');
  
  return authToken === expectedToken;
}

export default async function DashboardPage() {
  const isAuthenticated = await checkAuth();
  
  if (!isAuthenticated) {
    redirect('/dashboard/login');
  }

  return <RelationshipDashboard />;
}