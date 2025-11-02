import RelationshipDashboard from "./RelationshipDashboard";

export const metadata = {
  title: "Analytics Dashboard | Ellie",
  description: "Relationship analytics and insights",
};

export default function DashboardPage() {
  // ⚠️ IMPORTANT: Add authentication here before deploying to production
  // For now, this is accessible to anyone who knows the URL
  // 
  // Option 1: Check environment variable
  // if (process.env.NODE_ENV === 'production' && !process.env.ENABLE_DASHBOARD) {
  //   notFound();
  // }
  //
  // Option 2: Implement proper auth
  // const session = await getServerSession();
  // if (!session?.user?.isAdmin) {
  //   redirect("/");
  // }

  return <RelationshipDashboard />;
}
