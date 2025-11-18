
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import {
  Play,
  Pause,
  Edit3,
  Trash2,
  Database,
  Bot,
  Globe,
  Clock,
  Zap,
  Loader2, // Import Loader2 for spinner
  Search, // Import Search Icon
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export default function InstanceCard({
  instance,
  onToggleStatus,
  onExecute, // This function will now accept an argument (isDryRun: boolean)
  onEdit,
  onDelete,
  isDryRunLoading, // Receive loading state
}) {
  const getStatusColor = (status) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'paused':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'error':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getOperationIcon = (operation) => {
    switch (operation) {
      case 'strip_english':
        return <Globe className="w-4 h-4" />;
      case 'translate':
        return <Globe className="w-4 h-4" />;
      default:
        return <Bot className="w-4 h-4" />;
    }
  };
  
  const isQueryType = instance.instance_type === 'query';

  return (
    <Card className="bg-white/70 backdrop-blur-sm border-slate-200/50 hover:shadow-lg transition-all duration-200 group flex flex-col">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className={`w-12 h-12 bg-gradient-to-br ${isQueryType ? 'from-purple-100 to-fuchsia-100' : 'from-blue-100 to-indigo-100'} rounded-xl flex items-center justify-center group-hover:shadow-md transition-shadow duration-200 flex-shrink-0`}>
              {isQueryType ? (
                 <Search className="w-6 h-6 text-purple-600" />
              ) : (
                 <Database className="w-6 h-6 text-blue-600" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-slate-900 text-lg leading-tight mb-1 break-words h-16 flex items-start">{instance.name}</h3>
              <p className="text-slate-600 text-sm truncate">{instance.collection_name}</p>
            </div>
          </div>

          <Badge className={`${getStatusColor(instance.status)} border font-medium flex-shrink-0`}>
            {instance.status}
          </Badge>
        </div>

        {instance.description && (
          <p className="text-slate-600 text-sm mt-4 leading-relaxed">{instance.description}</p>
        )}
      </CardHeader>

      <CardContent className="space-y-4 flex-grow flex flex-col">
        {/* Render content based on instance type */}
        {isQueryType ? (
            <>
                {/* Query Configuration */}
                <div className="flex items-center gap-2 p-3 bg-slate-50/70 rounded-xl">
                    <Search className="w-4 h-4 text-purple-600"/>
                    <div>
                        <p className="text-sm font-medium text-slate-900">Query Interface</p>
                        <p className="text-xs text-slate-600">Search and retrieve similar content</p>
                    </div>
                </div>

                {/* Query Settings */}
                <div className="p-3 bg-slate-50/70 rounded-xl">
                    <p className="text-xs text-slate-500 mb-1">Configuration</p>
                    <div className="text-sm">
                        <span className="text-slate-700">Top K Results: </span>
                        <span className="font-semibold text-slate-900">{instance.top_k || 5}</span>
                    </div>
                    <div className="text-sm mt-1">
                        <span className="text-slate-700">Embedding Model: </span>
                        <span className="font-mono text-xs text-slate-800">{instance.embedding_model_name || 'text-embedding-3-large'}</span>
                    </div>
                </div>

                {/* Status Info for Query */}
                <div className="p-3 bg-slate-50/70 rounded-xl">
                    <p className="text-xs text-slate-500 mb-1">Status</p>
                    <p className="text-sm text-slate-800 font-medium">
                        {instance.status === 'active' ? 'Ready to query' : 'Inactive'}
                    </p>
                </div>

                <div className="flex-grow"></div> {/* Pushes buttons to bottom */}
            </>
        ) : (
            <>
                {/* AI Operation */}
                <div className="flex items-center gap-2 p-3 bg-slate-50/70 rounded-xl">
                    {getOperationIcon(instance.ai_operation)}
                    <div>
                        <p className="text-sm font-medium text-slate-900">
                        {instance.ai_operation.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </p>
                        <p className="text-xs text-slate-600">Target: {instance.target_field}</p>
                    </div>
                </div>

                {/* Query Filter */}
                <div className="p-3 bg-slate-50/70 rounded-xl">
                    <p className="text-xs text-slate-500 mb-1">Query Filter</p>
                    <code className="text-xs text-slate-700 font-mono break-words">{instance.query_filter}</code>
                </div>

                {/* GPT Model */}
                <div className="p-3 bg-slate-50/70 rounded-xl">
                    <p className="text-xs text-slate-500 mb-1">GPT Model</p>
                    <div className="text-sm">
                        <span className="font-semibold text-slate-900">
                            {instance.generative_model_name === 'gpt-4' && 'GPT-4'}
                            {instance.generative_model_name === 'gpt-4-turbo' && 'GPT-4 Turbo'}
                            {instance.generative_model_name === 'gpt-3.5-turbo' && 'GPT-3.5 Turbo'}
                            {!['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'].includes(instance.generative_model_name) && instance.generative_model_name}
                        </span>
                        <span className="text-xs text-slate-600 ml-2">
                            {instance.generative_model_name === 'gpt-4' && '(~30-40s)'}
                            {instance.generative_model_name === 'gpt-4-turbo' && '(~15-20s)'}
                            {instance.generative_model_name === 'gpt-3.5-turbo' && '(~5-7s)'}
                        </span>
                    </div>
                </div>

                {/* Schedule or Last Run Info */}
                {instance.schedule_interval > 0 ? (
                    <div className="flex items-center gap-2 p-3 bg-slate-50/70 rounded-xl text-sm">
                        <Clock className="w-4 h-4 text-slate-600"/>
                        <div>
                            <p className="text-sm font-medium text-slate-900">Scheduled Processing</p>
                            <p className="text-xs text-slate-600">
                                {instance.status === 'active' ? 
                                    `Runs every ${instance.schedule_interval} minute(s)` : 
                                    'Schedule paused'
                                }
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="p-3 bg-slate-50/70 rounded-xl">
                        <p className="text-xs text-slate-500 mb-1">Last Run</p>
                        <p className="text-sm text-slate-800 font-medium">
                            {instance.last_run ? format(new Date(instance.last_run), "MMM d, yyyy 'at' h:mm a") : "Never"}
                        </p>
                    </div>
                )}

                <div className="flex-grow"></div> {/* Pushes buttons to bottom */}
            </>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2">
            {isQueryType ? (
                 <Link to={createPageUrl(`QueryRunner?id=${instance.id}`)} className="flex-1">
                    <Button className="w-full bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-700 hover:to-fuchsia-700 text-white">
                        <Search className="w-4 h-4 mr-2" />
                        Open Query
                    </Button>
                </Link>
            ) : (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white"
                            disabled={instance.status !== 'active' || isDryRunLoading}
                        >
                            {isDryRunLoading ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                                <Play className="w-4 h-4 mr-2" />
                            )}
                            Execute
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                        <DropdownMenuItem onClick={() => onExecute(true)} disabled={isDryRunLoading}>
                            <Bot className="w-4 h-4 mr-2" /> Dry Run (Test)
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onExecute(false)} className="text-red-600 focus:text-red-600" disabled={isDryRunLoading}>
                            <Zap className="w-4 h-4 mr-2" /> Full Execution
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            )}

          {instance.instance_type !== 'query' && (
              <Button
                onClick={onToggleStatus}
                variant="outline"
                size="icon"
                className="border-slate-200 hover:bg-slate-100"
              >
                {instance.status === 'active' ?
                  <Pause className="w-4 h-4" /> :
                  <Play className="w-4 h-4" />
                }
              </Button>
          )}

          <Button
            onClick={onEdit}
            variant="outline"
            size="icon"
            className="border-slate-200 hover:bg-slate-100"
          >
            <Edit3 className="w-4 h-4" />
          </Button>

          <Button
            onClick={onDelete}
            variant="outline"
            size="icon"
            className="border-red-200 hover:bg-red-50 text-red-600 hover:text-red-700"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
