import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Zap } from "lucide-react";

export default function LoginFailed() {
  const handleRetry = () => {
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50/30">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4 text-center">
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl flex items-center justify-center shadow-lg">
              <Zap className="w-10 h-10 text-white" />
            </div>
          </div>
          <div>
            <CardTitle className="text-2xl font-bold">Access Denied</CardTitle>
            <CardDescription className="text-base mt-2">
              Unable to sign in
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Only @adaptive.co.uk Google accounts are allowed to access this application.
            </AlertDescription>
          </Alert>
          <div className="text-center text-sm text-slate-600">
            Please contact your administrator if you believe this is an error.
          </div>
          <Button
            onClick={handleRetry}
            variant="outline"
            className="w-full"
          >
            Back to Login
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
