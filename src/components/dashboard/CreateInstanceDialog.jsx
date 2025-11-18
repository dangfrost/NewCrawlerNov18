
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Database, Bot, Key, Clock, Search } from "lucide-react";

const AI_OPERATIONS = [
  { value: 'strip_english', label: 'Strip English Words', description: 'Remove English words from text field' },
  { value: 'translate', label: 'Translate Text', description: 'Translate text to another language' },
  { value: 'extract_entities', label: 'Extract Entities', description: 'Extract named entities from text' },
  { value: 'summarize', label: 'Summarize Text', description: 'Create text summaries' },
  { value: 'custom', label: 'Custom Operation', description: 'Define your own AI prompt' }
];

const AI_MODELS = [
  { value: 'gpt-4o', label: 'GPT-4o', description: 'Latest OpenAI, excellent quality (~15-20s)', provider: 'OpenAI' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo', description: 'Good quality, fast (~15-20s)', provider: 'OpenAI' },
  { value: 'gpt-4', label: 'GPT-4', description: 'Highest quality, slower (~30-40s)', provider: 'OpenAI' },
  { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', description: 'Fast but lower quality (~5-7s)', provider: 'OpenAI' },
  { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', description: 'Excellent quality, fast (~5-10s)', provider: 'Google' },
  { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', description: 'Very fast, good quality (~2-4s)', provider: 'Google' }
];

const DEFAULT_PROMPTS = {
  strip_english: "Given the following text, remove all English words and phrases, leaving only non-English content. If the text is purely English, return an empty string. The text is: {{FIELD_VALUE}}",
  translate: "Translate the following text to [TARGET_LANGUAGE]. The text is: {{FIELD_VALUE}}",
  extract_entities: "Extract named entities (people, organizations, locations, dates) from the following text. Return the result as a single JSON object with keys 'people', 'organizations', 'locations', 'dates'. The text is: {{FIELD_VALUE}}",
  summarize: "Summarize the following text in one or two sentences. The text is: {{FIELD_VALUE}}",
  custom: ""
};

export default function CreateInstanceDialog({ open, onOpenChange, onSave, initialData }) {
  const [formData, setFormData] = useState({
    instance_type: 'augmentor',
    name: '',
    description: '',
    zilliz_endpoint: '',
    zilliz_token: '',
    collection_name: '',
    primary_key_field: 'id',
    query_filter: '',
    target_field: '',
    vector_field_name: '',
    ai_operation: 'strip_english',
    prompt: DEFAULT_PROMPTS.strip_english,
    embedding_model_name: 'text-embedding-3-large', // Changed default
    generative_model_name: 'gpt-4o', // Default to latest model with good balance
    schedule_interval: 0,
    top_k: 5,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [instanceType, setInstanceType] = useState('augmentor');

  useEffect(() => {
    if (initialData) {
      const type = initialData.instance_type || 'augmentor';
      setInstanceType(type);
      setFormData({
        ...initialData,
        instance_type: type,
        primary_key_field: initialData.primary_key_field || 'id',
        prompt: initialData.prompt || DEFAULT_PROMPTS[initialData.ai_operation] || '',
        vector_field_name: initialData.vector_field_name || '',
        embedding_model_name: initialData.embedding_model_name || 'text-embedding-3-large', // Initialize from initialData or new default
        generative_model_name: initialData.generative_model_name || 'gpt-4o', // Initialize from initialData or default to latest model
        schedule_interval: initialData.schedule_interval || 0,
        top_k: initialData.top_k || 5,
      });
    } else {
      // Reset form for creation
      const type = instanceType; // Use the currently selected type
      setFormData({
        instance_type: type,
        name: '',
        description: '',
        zilliz_endpoint: '',
        zilliz_token: '',
        collection_name: '',
        primary_key_field: 'id',
        query_filter: '',
        target_field: '',
        vector_field_name: '',
        ai_operation: 'strip_english',
        prompt: DEFAULT_PROMPTS.strip_english,
        embedding_model_name: 'text-embedding-3-large', // New default
        generative_model_name: 'gpt-4o', // Default to latest model with good balance
        schedule_interval: 0,
        top_k: 5,
      });
    }
  }, [initialData, open, instanceType]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await onSave(formData);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => {
      const newState = { ...prev, [field]: value };
      if (field === 'ai_operation') {
        newState.prompt = DEFAULT_PROMPTS[value] || '';
      }
      return newState;
    });
  };

  const handleTypeChange = (value) => {
    setInstanceType(value);
    // When type changes, reset relevant parts of the form
    setFormData(prev => ({
        ...prev,
        instance_type: value,
        // Reset fields that are specific to one type or another
        prompt: value === 'augmentor' ? DEFAULT_PROMPTS.strip_english : '',
        ai_operation: value === 'augmentor' ? 'strip_english' : '',
        query_filter: value === 'augmentor' ? '' : prev.query_filter, // Keep existing if not augmentor, but clear if switching to it and it's not default
        target_field: value === 'augmentor' ? '' : prev.target_field,
        schedule_interval: value === 'augmentor' ? 0 : prev.schedule_interval,
        top_k: value === 'query' ? 5 : prev.top_k,
    }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-slate-900">
            {initialData ? 'Edit Instance' : 'Create New Instance'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-8">
            <div>
              <Label>Instance Type</Label>
               <Select value={instanceType} onValueChange={handleTypeChange} disabled={!!initialData}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select instance type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="augmentor">
                        <div className="flex items-center gap-2">
                            <Bot className="w-4 h-4"/>
                            <div>
                                <div className="font-medium">Augmentor</div>
                                <div className="text-xs text-slate-500">Process and enhance data in your collection.</div>
                            </div>
                        </div>
                    </SelectItem>
                    <SelectItem value="query">
                        <div className="flex items-center gap-2">
                           <Search className="w-4 h-4"/>
                           <div>
                                <div className="font-medium">Query</div>
                                <div className="text-xs text-slate-500">Create an interface to search your collection.</div>
                           </div>
                        </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                 {!!initialData && <p className="text-xs text-slate-500 mt-2">Instance type cannot be changed after creation.</p>}
            </div>

          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Database className="w-5 h-5" />
                Basic Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Instance Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    placeholder="e.g., English Text Cleaner"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="collection_name">Collection Name *</Label>
                  <Input
                    id="collection_name"
                    value={formData.collection_name}
                    onChange={(e) => handleChange('collection_name', e.target.value)}
                    placeholder="e.g., documents"
                    required
                  />
                </div>
              </div>
              
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => handleChange('description', e.target.value)}
                  placeholder="Describe what this instance does..."
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Zilliz Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Key className="w-5 h-5" />
                Zilliz Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="zilliz_endpoint">Zilliz Endpoint *</Label>
                <Input
                  id="zilliz_endpoint"
                  value={formData.zilliz_endpoint}
                  onChange={(e) => handleChange('zilliz_endpoint', e.target.value)}
                  placeholder="https://your-cluster.zillizcloud.com"
                  type="url"
                  required
                />
              </div>
              
              <div>
                <Label htmlFor="zilliz_token">Zilliz API Token *</Label>
                <Input
                  id="zilliz_token"
                  type="password"
                  value={formData.zilliz_token}
                  onChange={(e) => handleChange('zilliz_token', e.target.value)}
                  placeholder="Your Zilliz API token"
                  required
                />
              </div>

              <div>
                <Label htmlFor="primary_key_field">Primary Key Field Name *</Label>
                <Input
                  id="primary_key_field"
                  value={formData.primary_key_field}
                  onChange={(e) => handleChange('primary_key_field', e.target.value)}
                  placeholder="e.g., id, pk"
                  required
                />
                <p className="text-xs text-slate-500 mt-2">
                  The name of the primary key field in your Zilliz collection.
                </p>
              </div>

              {instanceType === 'augmentor' && (
                <div>
                  <Label htmlFor="query_filter">Query Filter *</Label>
                  <Input
                    id="query_filter"
                    value={formData.query_filter}
                    onChange={(e) => handleChange('query_filter', e.target.value)}
                    placeholder='e.g., langcode == "en" or content != ""'
                    required={instanceType === 'augmentor'}
                  />
                  <p className="text-xs text-slate-500 mt-2">
                    Use Zilliz filter syntax. <strong>Note:</strong> String values must be in double quotes (e.g., `field == "value"`).
                  </p>
                </div>
              )}

             {instanceType === 'augmentor' && (
                <div>
                  <Label htmlFor="target_field">Target Field *</Label>
                  <Input
                    id="target_field"
                    value={formData.target_field}
                    onChange={(e) => handleChange('target_field', e.target.value)}
                    placeholder="e.g., content, text, description"
                    required={instanceType === 'augmentor'}
                  />
                </div>
             )}

              <div>
                <Label htmlFor="vector_field_name">Vector Field Name</Label>
                <Input
                  id="vector_field_name"
                  value={formData.vector_field_name}
                  onChange={(e) => handleChange('vector_field_name', e.target.value)}
                  placeholder="e.g., vector, embedding (optional)"
                />
                <p className="text-xs text-slate-500 mt-2">
                  Provide the name of the existing vector field. If provided, the entire updated target field will be re-embedded into this field.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Query Configuration */}
          {instanceType === 'query' && (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <Search className="w-5 h-5" />
                        Query Configuration
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Alert>
                        <AlertDescription>
                        OpenAI API key is configured globally and will be used for embedding search terms.
                        </AlertDescription>
                    </Alert>
                    <div>
                        <Label htmlFor="top_k">Top K Results</Label>
                        <Input
                        id="top_k"
                        type="number"
                        value={formData.top_k}
                        onChange={(e) => handleChange('top_k', parseInt(e.target.value, 10) || 0)}
                        placeholder="e.g., 5"
                        />
                        <p className="text-xs text-slate-500 mt-2">
                        The maximum number of results to return for each search.
                        </p>
                    </div>
                     <div>
                        <Label htmlFor="embedding_model_name">Embedding Model</Label>
                        <Input
                            id="embedding_model_name"
                            value={formData.embedding_model_name}
                            onChange={(e) => handleChange('embedding_model_name', e.target.value)}
                            placeholder="e.g., text-embedding-ada-002, text-embedding-3-large"
                        />
                        <p className="text-xs text-slate-500 mt-2">
                            The OpenAI model used for embedding search terms.
                        </p>
                    </div>
                </CardContent>
            </Card>
          )}

          {/* AI Configuration */}
          {instanceType === 'augmentor' && (
            <Card>
                <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                    <Bot className="w-5 h-5" />
                    OpenAI Configuration
                </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                <Alert>
                    <AlertDescription>
                    OpenAI API key is configured globally for this application. No additional API key configuration needed.
                    </AlertDescription>
                </Alert>

                <div>
                    <Label htmlFor="ai_operation">AI Operation *</Label>
                    <Select
                    value={formData.ai_operation}
                    onValueChange={(value) => handleChange('ai_operation', value)}
                    required={instanceType === 'augmentor'}
                    >
                    <SelectTrigger>
                        <SelectValue placeholder="Select AI operation" />
                    </SelectTrigger>
                    <SelectContent>
                        {AI_OPERATIONS.map((op) => (
                        <SelectItem key={op.value} value={op.value}>
                            <div>
                            <div className="font-medium">{op.label}</div>
                            <div className="text-xs text-slate-500">{op.description}</div>
                            </div>
                        </SelectItem>
                        ))}
                    </SelectContent>
                    </Select>
                </div>

                <div>
                    <Label htmlFor="prompt">AI Prompt *</Label>
                    <Textarea
                    id="prompt"
                    value={formData.prompt}
                    onChange={(e) => handleChange('prompt', e.target.value)}
                    placeholder="Describe what you want the AI to do..."
                    rows={4}
                    required={instanceType === 'augmentor'}
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                    <Label htmlFor="generative_model_name">Generative Model *</Label>
                    <Select
                        value={formData.generative_model_name}
                        onValueChange={(value) => handleChange('generative_model_name', value)}
                        required={instanceType === 'augmentor'}
                    >
                        <SelectTrigger>
                        <SelectValue placeholder="Select AI model" />
                        </SelectTrigger>
                        <SelectContent>
                        {AI_MODELS.map((model) => (
                            <SelectItem key={model.value} value={model.value}>
                            <div>
                                <div className="font-medium">{model.label} <span className="text-xs text-slate-400">({model.provider})</span></div>
                                <div className="text-xs text-slate-500">{model.description}</div>
                            </div>
                            </SelectItem>
                        ))}
                        </SelectContent>
                    </Select>
                    <p className="text-xs text-slate-500 mt-2">
                        Choose the AI model based on your speed and quality needs.
                    </p>
                    </div>
                    <div>
                    <Label htmlFor="embedding_model_name">Embedding Model</Label>
                    <Input
                        id="embedding_model_name"
                        value={formData.embedding_model_name}
                        onChange={(e) => handleChange('embedding_model_name', e.target.value)}
                        placeholder="e.g., text-embedding-ada-002, text-embedding-3-large"
                    />
                    <p className="text-xs text-slate-500 mt-2">
                        The OpenAI model used for generating vectors.
                    </p>
                    </div>
                </div>
                </CardContent>
            </Card>
          )}
          
          {/* Scheduling Configuration */}
          {instanceType === 'augmentor' && (
            <Card>
                <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                    <Clock className="w-5 h-5" />
                    Scheduling
                </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                <div>
                    <Label htmlFor="schedule_interval">Schedule Interval (minutes)</Label>
                    <Input
                    id="schedule_interval"
                    type="number"
                    value={formData.schedule_interval}
                    onChange={(e) => handleChange('schedule_interval', parseInt(e.target.value, 10) || 0)}
                    placeholder="e.g., 60 for every hour"
                    />
                    <p className="text-xs text-slate-500 mt-2">
                    Set how often this instance should run automatically. Set to 0 to disable.
                    The instance status must be 'Active' for the schedule to run.
                    </p>
                </div>
                </CardContent>
            </Card>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-4 pt-6 border-t border-slate-200">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
            >
              {isLoading ? 'Saving...' : (initialData ? 'Update Instance' : 'Create Instance')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
