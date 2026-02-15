import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../services/api_client.dart';
import '../../widgets/loading.dart';
import '../../widgets/role_guard.dart';
import '../../providers/user_provider.dart';
import '../../routes.dart';

class MiningListScreen extends StatefulWidget {
  const MiningListScreen({super.key});
  @override
  State<MiningListScreen> createState() => _MiningListScreenState();
}

class _MiningListScreenState extends State<MiningListScreen> {
  bool _loading = true;
  List<dynamic> _items = [];

  @override
  void initState() {
    super.initState();
    _fetch();
  }

  Future<void> _fetch() async {
    setState(() => _loading = true);
    try {
      final res = await ApiClient.instance.get('/api/mining/pending');
      final data = jsonDecode(res.body) as List;
      setState(() => _items = data);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _openUpdate(dynamic item) {
    Navigator.pushNamed(context, AppRoutes.miningUpdate, arguments: item['id'] ?? item['ticketId']);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Mining Tasks')),
      body: RoleGuard(
        roles: const ['mining','director'],
        child: _loading
            ? const Loading()
            : ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: _items.length,
                itemBuilder: (context, i) {
                  final x = _items[i] as Map<String, dynamic>;
                  return Card(
                    child: ListTile(
                      title: Text('Mine ${x['mineNumber']} • Pit ${x['pitNumber']}'),
                      subtitle: Text('Dumpers: ${x['dumpersLoaded'] ?? 0} • Status: ${x['status'] ?? 'Pending'}'),
                      trailing: ElevatedButton(onPressed: () => _openUpdate(x), child: const Text('Update')),
                    ),
                  );
                },
              ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _fetch,
        child: const Icon(Icons.refresh),
      ),
    );
  }
}
