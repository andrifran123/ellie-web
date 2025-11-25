import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import RelationshipDashboard from "./RelationshipDashboard";

export const metadata = {
  title: "Analytics Dashboard | Ellie",
  description: "Comprehensive relationship analytics and insights",
};

// Simple authentication check
async function checkAuth() {
  const cookieStore = await cookies();
  const authToken = cookieStore.get('admin_auth')?.value;
  
  // Check if auth token matches the hashed password
  const expectedToken = process.env.ADMIN_AUTH_TOKEN;
  
  return authToken === expectedToken;
}

export default async function DashboardPage() {
  const isAuthenticated = await checkAuth();
  
  if (!isAuthenticated) {
    redirect('/dashboard/login');
  }

  return <RelationshipDashboard />;
}