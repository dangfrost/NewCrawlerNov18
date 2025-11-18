
import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { instancesApi } from '@/api/client';
// TODO: Migrate to Express API endpoint
// import { runZillizQuery } from '@/functions-stub';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, Loader2, FileText, Tag, Bug, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

const ResultCard = ({ result }) => {
    // Extract key fields we want to display prominently
    const displayFields = {
        'Title': result.title,
        'Type': result.type, 
        'Language': result.langcode,
        'URL': result.url,
        'Score': result.distance?.toFixed(4)
    };

    // Get other fields (excluding some technical ones and the main content)
    const otherFields = {};
    const excludeFields = ['id', 'distance', 'title', 'type', 'langcode', 'url', 'content', 'metadata']; // Keep 'metadata' excluded
    
    Object.keys(result).forEach(key => {
        if (!excludeFields.includes(key) && result[key] != null) {
            otherFields[key] = result[key];
        }
    });

    // Parse tagged content sections
    const parseTaggedContent = (content) => {
        if (!content) return {};
        
        const sections = {};
        // Find all [tag]content[/tag] patterns
        // Using a non-greedy quantifier (.*?) to correctly match between tags
        const tagRegex = /\[([^\]]+)\](.*?)\[\/\1\]/gs; 
        let match;
        
        while ((match = tagRegex.exec(content)) !== null) {
            const tagName = match[1];
            const tagContent = match[2].trim();
            sections[tagName] = tagContent;
        }
        
        return sections;
    };

    const contentSections = parseTaggedContent(result.content);
    
    return (
        <Card className="bg-white/80 backdrop-blur-sm">
            <CardHeader>
                <CardTitle className="flex justify-between items-start">
                    <div>
                        <span className="text-base font-bold text-slate-800">
                            {result.title || 'Untitled Record'}
                        </span>
                        <p className="text-xs text-slate-500 font-mono mt-1">
                            ID: {result.id}
                        </p>
                    </div>
                    <Badge variant="outline">Score: {result.distance?.toFixed(4) || 'N/A'}</Badge>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Parsed Content Sections */}
                {Object.keys(contentSections).length > 0 && (
                    <div className="space-y-3">
                        {Object.entries(contentSections).map(([tagName, tagContent]) => (
                            <div key={tagName}>
                                <h4 className="font-semibold text-sm text-slate-700 flex items-center gap-2 capitalize">
                                    <FileText className="w-4 h-4"/>
                                    {/* Format tag names (e.g., "primaryContent" -> "Primary Content") */}
                                    {tagName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim()}
                                </h4>
                                <div className="text-sm text-slate-700 bg-slate-50 p-3 rounded-md max-h-32 overflow-y-auto">
                                    {tagName === 'languages' ? (
                                        // Special handling for language links (e.g., [English](url), [Spanish](url))
                                        <div dangerouslySetInnerHTML={{ 
                                            __html: tagContent
                                                .replace(/\\\[/g, '[') // Unescape [
                                                .replace(/\\\]/g, ']') // Unescape ]
                                                .replace(/\[([^\]]+?)\]\s*\(([^)]+?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline mr-3">$1</a>')
                                        }} />
                                    ) : (
                                        <p className="whitespace-pre-wrap">
                                            {tagContent.replace(/\\n/g, '\n').replace(/\\\[/g, '[').replace(/\\\]/g, ']')}
                                        </p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Raw content if no tagged sections found or content is not tagged */}
                {result.content && Object.keys(contentSections).length === 0 && (
                    <div>
                        <h4 className="font-semibold text-sm text-slate-700 flex items-center gap-2">
                            <FileText className="w-4 h-4"/> Content
                        </h4>
                        <p className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 p-3 rounded-md max-h-32 overflow-y-auto">
                            {result.content.replace(/\\n/g, '\n').replace(/\\\[/g, '[').replace(/\\\]/g, ']')}
                        </p>
                    </div>
                )}

                {/* Key Metadata */}
                <div className="space-y-2 rounded-lg bg-slate-50 p-4">
                    <h4 className="font-semibold text-sm text-slate-700 flex items-center gap-2">
                        <Tag className="w-4 h-4"/> Key Information
                    </h4>
                    <div className="grid grid-cols-1 gap-2 text-sm">
                        {Object.entries(displayFields).map(([key, value]) => 
                            value && (
                                <div key={key} className="flex justify-between">
                                    <strong className="text-slate-600">{key}:</strong>
                                    <span className="text-slate-800 text-right overflow-hidden text-ellipsis whitespace-nowrap max-w-[70%]">
                                        {key === 'URL' ? (
                                            <a href={value} target="_blank" rel="noopener noreferrer" 
                                               className="text-blue-600 hover:underline">
                                                {value}
                                            </a>
                                        ) : value}
                                    </span>
                                </div>
                            )
                        )}
                    </div>
                </div>

                {/* Additional Fields */}
                {Object.keys(otherFields).length > 0 && (
                    <div className="space-y-2 rounded-lg bg-slate-100 p-4">
                        <h4 className="font-semibold text-sm text-slate-700">Additional Fields</h4>
                        <div className="grid grid-cols-1 gap-2 text-xs">
                            {Object.entries(otherFields).map(([key, value]) => (
                                <div key={key} className="flex justify-between">
                                    <strong className="text-slate-600 truncate">{key}:</strong>
                                    <span className="text-slate-800 truncate" title={String(value)}>
                                        {String(value).substring(0, 100)}
                                        {String(value).length > 100 ? '...' : ''}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

export default function QueryRunner() {
    const location = useLocation();
    const [instance, setInstance] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [results, setResults] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [debugData, setDebugData] = useState(null);
    const [showDebug, setShowDebug] = useState(false);
    
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const id = params.get('id');
        if (id) {
            instancesApi.get(id)
                .then(setInstance)
                .catch(err => setError("Failed to load instance details."));
        }
    }, [location.search]);

    const handleSearch = async (e) => {
        e.preventDefault();
        if (!searchTerm || !instance) return;

        setIsLoading(true);
        setError(null);
        setResults([]);
        setDebugData(null); // Clear previous debug data

        try {
            // Call the new Express API endpoint
            const response = await fetch(`${window.location.origin}/api/query`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('base44_access_token') || 'placeholder-token'}`
                },
                body: JSON.stringify({
                    instance_id: instance.id,
                    search_term: searchTerm
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Query failed');
            }

            const responseData = await response.json();

            // Store raw response for debugging
            setDebugData({
                rawResponse: responseData,
                searchTerm: searchTerm,
                instanceConfig: {
                    id: instance.id,
                    name: instance.name,
                    collection_name: instance.collection_name,
                    embedding_model_name: instance.embedding_model_name,
                    top_k: instance.top_k,
                    zilliz_endpoint: instance.zilliz_endpoint
                },
                zillizQuery: responseData.data?.debug_info?.zilliz_query,
                zillizUrl: responseData.data?.debug_info?.zilliz_url,
                embeddingVectorLength: responseData.data?.debug_info?.embedding_vector_length,
                zillizResponseCode: responseData.data?.debug_info?.zilliz_response_code,
                timestamp: new Date().toISOString()
            });

            // Correctly extract the results array from the response data.
            const resultsData = responseData.data?.results || [];
            setResults(Array.isArray(resultsData) ? resultsData : []);

        } catch (e) {
            setError(e.message);
            setDebugData(prev => {
                const baseDebugData = prev || {
                    searchTerm: searchTerm,
                    instanceConfig: instance ? { 
                        id: instance.id,
                        name: instance.name,
                        collection_name: instance.collection_name,
                        embedding_model_name: instance.embedding_model_name,
                        top_k: instance.top_k,
                        zilliz_endpoint: instance.zilliz_endpoint
                    } : null
                };
                return {
                    ...baseDebugData,
                    error: e.message,
                    timestamp: new Date().toISOString()
                };
            });
        } finally {
            setIsLoading(false);
        }
    };
    
    if (!instance) {
        return (
            <div className="p-6 flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 animate-spin" />
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-purple-50/30 p-6">
            <div className="max-w-4xl mx-auto space-y-8">
                <div>
                    <h1 className="text-4xl font-bold text-slate-900">{instance.name}</h1>
                    <p className="text-slate-600 text-lg">Querying collection: <span className="font-semibold text-purple-700">{instance.collection_name}</span></p>
                </div>

                <form onSubmit={handleSearch} className="flex gap-2">
                    <Input 
                        placeholder="Enter your search query..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="text-base"
                    />
                    <Button type="submit" disabled={isLoading} className="bg-gradient-to-r from-purple-600 to-fuchsia-600 w-32">
                        {isLoading ? <Loader2 className="w-5 h-5 animate-spin"/> : <><Search className="w-5 h-5 mr-2"/> Search</>}
                    </Button>
                </form>

                {/* Debug Section */}
                {debugData && (
                    <Collapsible open={showDebug} onOpenChange={setShowDebug}>
                        <CollapsibleTrigger asChild>
                            <Button variant="outline" className="w-full justify-between pr-4">
                                <div className="flex items-center">
                                    <Bug className="w-4 h-4 mr-2" />
                                    Debug Information
                                </div>
                                <ChevronRight className={`w-4 h-4 transition-transform ${showDebug ? 'rotate-90' : ''}`} />
                            </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                            <Card className="mt-4 bg-slate-900 text-slate-100">
                                <CardHeader>
                                    <CardTitle className="text-green-400">Debug Information</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-4 font-mono text-xs">
                                        {debugData.timestamp && (
                                            <div>
                                                <h4 className="text-yellow-400 font-bold mb-2">Timestamp:</h4>
                                                <p>{debugData.timestamp}</p>
                                            </div>
                                        )}
                                        <div>
                                            <h4 className="text-yellow-400 font-bold mb-2">Search Parameters:</h4>
                                            <p>Search Term: {debugData.searchTerm}</p>
                                            <p>Instance ID: {debugData.instanceConfig?.id}</p>
                                            <p>Instance Name: {debugData.instanceConfig?.name}</p>
                                            <p>Collection: {debugData.instanceConfig?.collection_name}</p>
                                            <p>Embedding Model: {debugData.instanceConfig?.embedding_model_name}</p>
                                            <p>Top K: {debugData.instanceConfig?.top_k}</p>
                                            <p>Zilliz Endpoint: {debugData.instanceConfig?.zilliz_endpoint}</p>
                                        </div>

                                        {debugData.zillizQuery && (
                                            <div>
                                                <h4 className="text-yellow-400 font-bold mb-2">Zilliz Query:</h4>
                                                <div className="bg-slate-800 p-3 rounded overflow-x-auto whitespace-pre-wrap">
                                                    <p>URL: {debugData.zillizUrl}</p>
                                                    <p>Embedding Vector Length: {debugData.embeddingVectorLength}</p>
                                                    <p>Response Code: {debugData.zillizResponseCode}</p>
                                                    <br />
                                                    <strong>Query Payload:</strong>
                                                    <pre>{JSON.stringify({
                                                        collectionName: debugData.zillizQuery.collectionName,
                                                        limit: debugData.zillizQuery.limit,
                                                        outputFields: debugData.zillizQuery.outputFields,
                                                        vector: `[${debugData.embeddingVectorLength} dimensional vector - truncated for display]`
                                                    }, null, 2)}</pre>
                                                </div>
                                            </div>
                                        )}
                                        
                                        {debugData.rawResponse && (
                                            <div>
                                                <h4 className="text-yellow-400 font-bold mb-2">Raw Response:</h4>
                                                <pre className="bg-slate-800 p-3 rounded overflow-x-auto whitespace-pre-wrap">
                                                    {JSON.stringify(debugData.rawResponse, null, 2)}
                                                </pre>
                                            </div>
                                        )}

                                        {debugData.error && (
                                            <div>
                                                <h4 className="text-red-400 font-bold mb-2">Error:</h4>
                                                <p className="text-red-300">{debugData.error}</p>
                                            </div>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        </CollapsibleContent>
                    </Collapsible>
                )}

                <div className="space-y-4">
                    {isLoading && (
                         <div className="text-center py-16">
                            <Loader2 className="w-12 h-12 text-purple-500 mx-auto animate-spin"/>
                         </div>
                    )}

                    {!isLoading && !error && results.length === 0 && (
                        <div className="text-center py-16 bg-white/30 backdrop-blur-sm rounded-2xl border border-slate-200/50">
                            <h3 className="text-xl font-semibold text-slate-900 mb-2">Ready to search</h3>
                            <p className="text-slate-600">Enter a query above to search for results.</p>
                        </div>
                    )}
                    
                    {!isLoading && !error && results.length > 0 && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h2 className="text-xl font-bold text-slate-900">Search Results</h2>
                                <Badge variant="outline">{results.length} results found</Badge>
                            </div>
                            {results.map((result) => (
                                <ResultCard key={result.id} result={result} />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
