import React, { useState } from 'react';
import { dbMigrate } from '@/functions/dbMigrate';
import { testDbConnection } from '@/functions/testDbConnection';
import { migrateData } from '@/functions/migrateData';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, XCircle, Loader2, Database, AlertTriangle, TestTube } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function MigrationSetup() {
    const [isRunning, setIsRunning] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [isMigratingData, setIsMigratingData] = useState(false);
    const [result, setResult] = useState(null);
    const [testResult, setTestResult] = useState(null);
    const [dataResult, setDataResult] = useState(null);
    const [error, setError] = useState(null);

    const testConnection = async () => {
        setIsTesting(true);
        setTestResult(null);
        setError(null);

        try {
            const { data, error: fnError } = await testDbConnection({});
            
            if (fnError) {
                throw new Error(fnError.message || 'Connection test failed');
            }
            
            if (data.error) {
                throw new Error(data.error);
            }
            
            setTestResult(data);
        } catch (err) {
            console.error('Connection test error:', err);
            setError(err.message || 'Failed to test connection');
        } finally {
            setIsTesting(false);
        }
    };

    const runMigration = async () => {
        setIsRunning(true);
        setResult(null);
        setError(null);

        try {
            const { data, error: fnError } = await dbMigrate({});
            
            if (fnError) {
                throw new Error(fnError.message || 'Migration failed');
            }
            
            if (data.error) {
                throw new Error(`${data.error}${data.details ? '\n\n' + data.details : ''}`);
            }
            
            setResult(data);
        } catch (err) {
            console.error('Migration error:', err);
            setError(err.message || 'Failed to run migration');
        } finally {
            setIsRunning(false);
        }
    };

    const runDataMigration = async () => {
        setIsMigratingData(true);
        setDataResult(null);
        setError(null);

        try {
            const { data, error: fnError } = await migrateData({});
            
            if (fnError) {
                throw new Error(fnError.message || 'Data migration failed');
            }
            
            if (data.error) {
                throw new Error(`${data.error}${data.details ? '\n\n' + data.details : ''}`);
            }
            
            setDataResult(data);
        } catch (err) {
            console.error('Data migration error:', err);
            setError(err.message || 'Failed to migrate data');
        } finally {
            setIsMigratingData(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30 p-6">
            <div className="max-w-2xl mx-auto space-y-8">
                <div>
                    <h1 className="text-4xl font-bold text-slate-900 mb-2">Database Setup</h1>
                    <p className="text-slate-600 text-lg">Initialize your NeonDB tables</p>
                </div>

                <Alert className="bg-blue-50 border-blue-200">
                    <AlertTriangle className="h-4 w-4 text-blue-600" />
                    <AlertDescription className="text-blue-800">
                        <strong>Requirements:</strong>
                        <ul className="list-disc list-inside mt-2 space-y-1">
                            <li>You must be logged in as an <strong>admin</strong> user</li>
                            <li>DATABASE_URL must be configured in environment variables</li>
                        </ul>
                    </AlertDescription>
                </Alert>

                <Card className="bg-white/70 backdrop-blur-sm">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <TestTube className="w-6 h-6 text-purple-600" />
                            Test Database Connection
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-slate-600">
                            Run this first to diagnose connection issues and find the best SSL configuration.
                        </p>

                        <Button 
                            onClick={testConnection} 
                            disabled={isTesting}
                            className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
                        >
                            {isTesting ? (
                                <>
                                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                    Testing Connection...
                                </>
                            ) : (
                                <>
                                    <TestTube className="w-5 h-5 mr-2" />
                                    Test Connection
                                </>
                            )}
                        </Button>

                        {testResult && testResult.success && (
                            <Alert className="bg-green-50 border-green-200">
                                <CheckCircle className="h-4 w-4 text-green-600" />
                                <AlertDescription className="text-green-800">
                                    <strong>Connection Test Results:</strong>
                                    <div className="mt-2 space-y-2">
                                        <p className="font-semibold">{testResult.recommendation}</p>
                                        <details className="text-xs bg-green-100 p-2 rounded">
                                            <summary className="cursor-pointer font-semibold">View Details</summary>
                                            <pre className="mt-2 overflow-auto">{JSON.stringify(testResult, null, 2)}</pre>
                                        </details>
                                    </div>
                                </AlertDescription>
                            </Alert>
                        )}
                    </CardContent>
                </Card>

                <Card className="bg-white/70 backdrop-blur-sm">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Database className="w-6 h-6 text-blue-600" />
                            Create Database Tables
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-slate-600">
                            This will create the necessary tables in your NeonDB database:
                        </p>
                        <ul className="list-disc list-inside space-y-1 text-slate-700">
                            <li><code className="bg-slate-100 px-2 py-1 rounded">database_instances</code></li>
                            <li><code className="bg-slate-100 px-2 py-1 rounded">jobs</code></li>
                            <li><code className="bg-slate-100 px-2 py-1 rounded">job_logs</code></li>
                        </ul>

                        <Button 
                            onClick={runMigration} 
                            disabled={isRunning}
                            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                        >
                            {isRunning ? (
                                <>
                                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                    Creating Tables...
                                </>
                            ) : (
                                <>
                                    <Database className="w-5 h-5 mr-2" />
                                    Run Migration
                                </>
                            )}
                        </Button>

                        {result && result.success && (
                            <Alert className="bg-green-50 border-green-200">
                                <CheckCircle className="h-4 w-4 text-green-600" />
                                <AlertDescription className="text-green-800">
                                    <strong>Success!</strong> {result.message}
                                </AlertDescription>
                            </Alert>
                        )}

                        {error && (
                            <Alert variant="destructive">
                                <XCircle className="h-4 w-4" />
                                <AlertDescription>
                                    <strong>Error:</strong> 
                                    <pre className="mt-2 text-xs whitespace-pre-wrap">{error}</pre>
                                </AlertDescription>
                            </Alert>
                        )}
                    </CardContent>
                </Card>

                <Card className="bg-white/70 backdrop-blur-sm">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Database className="w-6 h-6 text-green-600" />
                            Migrate Existing Data
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-slate-600">
                            Copy your existing data from Base44 entities to NeonDB tables:
                        </p>
                        <ul className="list-disc list-inside space-y-1 text-slate-700">
                            <li>Database Instances</li>
                            <li>Jobs</li>
                            <li>Job Logs</li>
                        </ul>

                        <Button 
                            onClick={runDataMigration} 
                            disabled={isMigratingData}
                            className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
                        >
                            {isMigratingData ? (
                                <>
                                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                    Migrating Data...
                                </>
                            ) : (
                                <>
                                    <Database className="w-5 h-5 mr-2" />
                                    Migrate Data to NeonDB
                                </>
                            )}
                        </Button>

                        {dataResult && dataResult.success && (
                            <Alert className="bg-green-50 border-green-200">
                                <CheckCircle className="h-4 w-4 text-green-600" />
                                <AlertDescription className="text-green-800">
                                    <strong>Success!</strong> {dataResult.message}
                                    <details className="text-xs bg-green-100 p-2 rounded mt-2">
                                        <summary className="cursor-pointer font-semibold">View Details</summary>
                                        <pre className="mt-2">{JSON.stringify(dataResult, null, 2)}</pre>
                                    </details>
                                </AlertDescription>
                            </Alert>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}