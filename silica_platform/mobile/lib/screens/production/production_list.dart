import 'dart:convert';
import 'package:flutter/material.dart';
import '../../services/api_client.dart';
import '../../widgets/loading.dart';
import '../../widgets/role_guard.dart';
import '../../routes.dart';

class ProductionListScreen extends StatefulWidget {
  const ProductionListScreen({super.key});
  @override
  State<ProductionListScreen> createState() => _ProductionListScreenState();
}

class _ProductionListScreenState extends State<ProductionListScreen> {
  bool _loading = true;
  List<dynamic> _items = [];

  @override
  void initState() { super.initState(); _fetch(); }

  Future<void> _fetch() async {
    setState(() => _loading = true);
    try {
      final res = await ApiClient.instance.get('/api/production/daily');
      final data = jsonDecode(res.body) as List;
      setState(() => _items = data);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    } finally { if (mounted) setState(() => _loading = false); }
  }

  void _openUpdate(dynamic item) {
    Navigator.pushNamed(context, AppRoutes.productionUpdate, arguments: item['id']);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Production Logs')),
      body: RoleGuard(
        roles: const ['production','director'],
        child: _loading ? const Loading() : ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: _items.length,
          itemBuilder: (context, i) {
            final x = _items[i] as Map<String, dynamic>;
            return Card(
              child: ListTile(
                title: Text('Plant ${x['plantId']} • Grade ${x['grade']}'),
                subtitle: Text('Qty: ${x['quantity']} • QC: ${x['status']}'),
                trailing: ElevatedButton(onPressed: () => _openUpdate(x), child: const Text('Update')),
              ),
            );
          },
        ),
      ),
      floatingActionButton: FloatingActionButton(onPressed: _fetch, child: const Icon(Icons.refresh)),
    );
  }
}
