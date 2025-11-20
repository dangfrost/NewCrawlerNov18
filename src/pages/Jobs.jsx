import React, { useState, useEffect, useCallback } from "react";
import { jobsApi, instancesApi } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Activity, CheckCircle, XCircle, Clock, Ban, RefreshCw, AlertTriangle, ChevronDown, LogIn, Trash2 } from "lucide-react";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { useToast } from "@/components/ui/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { base44 } from "@/api/base44Client";
import LogViewer from '../components/jobs/LogViewer';


export default function JobsPage() {
  const [jobs, setJobs] = useState([]);
  const [instances, setInstances] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedJobs, setExpandedJobs] = useState(new Set());
  const [isAuthenticated, setIsAuthenticated] = useState(null);
  const { toast } = useToast();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const authenticated = await base44.auth.isAuthenticated();
      setIsAuthenticated(authenticated);
      if (authenticated) {
        loadData();
      } else {
        setIsLoading(false);
      }
    } catch (error) {
      console.error("Auth check error:", error);
      setIsAuthenticated(false);
      setIsLoading(false);
    }
  };

  const loadData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh || isLoading) {
        setIsLoading(true);
    }
    setError(null);
    
    try {
      const [jobsData, instancesData] = await Promise.all([
        jobsApi.list(20),
        instancesApi.list()
      ]);
      setJobs(jobsData);
      setInstances(instancesData);
    } catch (error) {
      console.error("Error loading jobs:", error);
      if (error.message.includes("logged in")) {
        setIsAuthenticated(false);
      } else {
        setError(error.message || "Failed to load jobs. Please refresh the page.");
        // Only show toast for non-polling errors
        if (!isPolling) {
          toast({
            title: "⚠️ Connection Issue",
            description: "Unable to load job status. The page will retry automatically.",
            variant: "destructive",
            duration: 5000,
          });
        }
      }
    } finally {
        setIsLoading(false);
    }
  }, [isLoading, toast]);

  useEffect(() => {
    if (isAuthenticated) {
      loadData();
      const interval = setInterval(() => loadData(false), 5000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, loadData]);

  const handleLogin = () => {
    base44.auth.redirectToLogin();
  };
  
  const getInstanceName = (instanceId) => instances.find(i => i.id === instanceId)?.name || 'Unknown';

  const handleToggleDetails = (jobId) => {
    setExpandedJobs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(jobId)) {
        newSet.delete(jobId);
      } else {
        newSet.add(jobId);
      }
      return newSet;
    });
  };

  const handleCancelJob = async (jobId) => {
    if (!window.confirm("Are you sure you want to stop this job?")) return;
    try {
      await jobsApi.cancel(jobId);
      toast({
        title: "🛑 Stopping Job",
        description: "Processing will stop after the current batch completes.",
        duration: 4000,
      });
      loadData(true);
    } catch (error) {
      console.error("Failed to cancel job:", error);
      toast({
        title: "❌ Cannot Stop Job",
        description: error.message || "Unable to cancel. Please try again.",
        variant: "destructive",
        duration: 6000,
      });
    }
  };

  const handleDeleteJob = async (jobId, jobName) => {
    if (!window.confirm(`Are you sure you want to delete this job and all its logs?\n\nJob: ${jobName}`)) return;
    try {
      await jobsApi.delete(jobId);
      toast({
        title: "🗑️ Job Deleted",
        description: "Job and all associated logs have been removed.",
        duration: 3000,
      });
      loadData(true);
    } catch (error) {
      console.error("Failed to delete job:", error);
      toast({
        title: "❌ Cannot Delete Job",
        description: error.message || "Unable to delete. Please try again.",
        variant: "destructive",
        duration: 6000,
      });
    }
  };

  const getStatusInfo = (status) => {
    switch (status) {
      case 'completed': return { color: 'green', icon: CheckCircle };
      case 'failed': return { color: 'red', icon: XCircle };
      case 'running': return { color: 'blue', icon: Activity };
      case 'pending': return { color: 'yellow', icon: Clock };
      case 'cancelled': return { color: 'gray', icon: Ban };
      default: return { color: 'gray', icon: Clock };
    }
  };

  const renderJobDetails = (job) => {
    return <LogViewer jobId={job.id} />;
  }

  if (isAuthenticated === false) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white/70 backdrop-blur-sm rounded-2xl shadow-xl p-8 text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <LogIn className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Authentication Required</h2>
          <p className="text-slate-600 mb-6">Please log in to view jobs.</p>
          <Button 
            onClick={handleLogin}
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
          >
            <LogIn className="w-5 h-5 mr-2" />
            Log In
          </Button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex justify-between items-center">
          <h1 className="text-4xl font-bold text-slate-900">Jobs</h1>
          <Button variant="ghost" size="icon" onClick={() => loadData(true)} disabled={isLoading}>
            <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          {isLoading && jobs.length === 0 ? (
             <p className="text-slate-500">Loading jobs...</p>
          ) : jobs.length === 0 ? (
            <div className="text-center py-16 bg-white/30 backdrop-blur-sm rounded-2xl border border-slate-200/50">
                <h3 className="text-xl font-semibold text-slate-900 mb-2">No jobs found</h3>
                <p className="text-slate-600">Run an instance from the Dashboard to see jobs here.</p>
            </div>
          ) : (
            jobs.map(job => {
              const { color, icon: Icon } = getStatusInfo(job.status);
              
              const hasTotal = job.total_records > 0;
              const progress = hasTotal ? ((job.processed_records + job.failed_records) / job.total_records) * 100 : 0;
              
              const isCancellable = job.status === 'running' || job.status === 'pending';
              const isExpanded = expandedJobs.has(job.id);

              return (
                <Card key={job.id} className="bg-white/70 backdrop-blur-sm overflow-hidden">
                  <CardHeader className="pb-4 cursor-pointer hover:bg-slate-50/50" onClick={() => handleToggleDetails(job.id)}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <CardTitle className="text-lg font-bold text-slate-900">{getInstanceName(job.instance_id)}</CardTitle>
                        <p className="text-sm text-slate-500">
                          Job ID: {job.id} &bull; 
                          {job.started_at ? 
                            `Started ${formatDistanceToNow(parseISO(job.started_at), { addSuffix: true })}` :
                            `Created ${formatDistanceToNow(parseISO(job.created_date), { addSuffix: true })}`
                          }
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                         <Badge variant="secondary" className="font-mono text-xs">
                          {job.execution_type === 'dry_run' ? 'Dry Run' : 'Full Execution'}
                         </Badge>
                         {isCancellable && (
                            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleCancelJob(job.id); }}>
                                <Ban className="w-4 h-4 mr-2"/>
                                Stop
                            </Button>
                         )}
                         {!isCancellable && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteJob(job.id, getInstanceName(job.instance_id));
                              }}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                                <Trash2 className="w-4 h-4 mr-2"/>
                                Delete
                            </Button>
                         )}
                        <Badge variant="outline" className={`border-${color}-300 bg-${color}-50 text-${color}-800 text-sm`}>
                          <Icon className={`w-4 h-4 mr-2 ${job.status === 'running' ? 'animate-spin' : ''}`} />
                          {job.status}
                        </Badge>
                        <ChevronDown className={`w-5 h-5 text-slate-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {job.execution_type === 'full_execution' && !hasTotal && (
                       <div className="mb-4 text-center p-3 bg-slate-100 rounded-lg">
                         <p className="font-medium text-slate-700">Processing records... Progress will be shown as batches complete.</p>
                       </div>
                    )}
                    {job.execution_type === 'full_execution' && hasTotal && (
                      <div className="mb-4">
                        <div className="flex justify-between mb-1 text-sm font-medium">
                          <span className="text-slate-700">Progress</span>
                          <span className={`text-${color}-600 font-semibold`}>
                            {job.processed_records + job.failed_records} / {job.total_records}
                          </span>
                        </div>
                        <Progress value={progress} className="w-full" indicatorClassName={`bg-${color}-500`} />
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-4 text-center text-xs">
                      <div className="p-2 bg-green-50 rounded-md">
                        <p className="font-bold text-lg text-green-800">{job.processed_records || 0}</p>
                        <p className="font-medium text-green-600">Completed</p>
                      </div>
                      <div className="p-2 bg-red-50 rounded-md">
                        <p className="font-bold text-lg text-red-800">{job.failed_records || 0}</p>
                        <p className="font-medium text-red-600">Failed</p>
                      </div>
                       <div className="p-2 bg-slate-100 rounded-md">
                        <p className="font-bold text-lg text-slate-800">{job.total_records || 0}</p>
                        <p className="font-medium text-slate-600">In Scope</p>
                        {job.all_records_count && job.all_records_count > job.total_records && (
                          <p className="text-xs text-slate-500 mt-1">
                            of {job.all_records_count} total
                          </p>
                        )}
                      </div>
                    </div>
                    {isExpanded && renderJobDetails(job)}
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>
      </div>
    </div>
  );
}