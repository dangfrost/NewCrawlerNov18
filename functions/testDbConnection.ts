import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import postgres from 'npm:postgres@3.4.3';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const connectionString = Deno.env.get('DATABASE_URL');
    if (!connectionString) {
      return Response.json({ 
        error: 'DATABASE_URL not set',
        details: 'Environment variable DATABASE_URL is missing'
      }, { status: 500 });
    }

    // Parse connection string to show config (without password)
    const urlPattern = /^postgres(?:ql)?:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/;
    const match = connectionString.match(urlPattern);
    const config = match ? {
      user: match[1],
      host: match[3],
      port: match[4],
      database: match[5]
    } : { raw: 'Could not parse connection string' };

    console.log('Testing connection with config:', config);

    // Test different SSL configurations
    const testConfigs = [
      { name: 'ssl: prefer', options: { ssl: 'prefer', max: 1, connect_timeout: 30, prepare: false } },
      { name: 'ssl: require', options: { ssl: 'require', max: 1, connect_timeout: 30, prepare: false } },
      { name: 'ssl: allow', options: { ssl: 'allow', max: 1, connect_timeout: 30, prepare: false } },
      { name: 'no ssl option', options: { max: 1, connect_timeout: 30, prepare: false } }
    ];

    const results = [];

    for (const testConfig of testConfigs) {
      try {
        console.log(`Testing: ${testConfig.name}`);
        const client = postgres(connectionString, testConfig.options);
        
        // Try a simple query
        const result = await client`SELECT NOW() as current_time, version() as pg_version`;
        
        await client.end();
        
        results.push({
          config: testConfig.name,
          success: true,
          time: result[0].current_time,
          version: result[0].pg_version
        });
        
        console.log(`✓ ${testConfig.name} succeeded`);
      } catch (error) {
        results.push({
          config: testConfig.name,
          success: false,
          error: error.message,
          stack: error.stack?.substring(0, 500)
        });
        console.log(`✗ ${testConfig.name} failed:`, error.message);
      }
    }

    return Response.json({ 
      success: true,
      connection_config: config,
      test_results: results,
      recommendation: results.find(r => r.success) 
        ? `Use: ${results.find(r => r.success).config}`
        : 'All connection attempts failed'
    });

  } catch (error) {
    console.error('Test error:', error);
    return Response.json({ 
      error: error.message,
      details: error.stack?.substring(0, 1000)
    }, { status: 500 });
  }
});