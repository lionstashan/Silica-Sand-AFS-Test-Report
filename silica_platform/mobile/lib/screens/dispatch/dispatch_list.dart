import 'dart:convert';
import 'package:flutter/material.dart';
import '../../services/api_client.dart';
import '../../widgets/loading.dart';
import '../../widgets/role_guard.dart';
import '../../routes.dart';

class DispatchListScreen extends StatefulWidget {
  const DispatchListScreen({super.key});
  @override
  State<DispatchListScreen> createState() => _DispatchListScreenState();
}

class _DispatchListScreenState extends State<DispatchListScreen> {
  bool _loading = true;
  List<dynamic> _items = [];

  @override
  void initState() { super.initState(); _fetch(); }

  Future<void> _fetch() async {
    setState(() => _loading = true);
    try {
      final res = await ApiClient.instance.get('/api/dispatch/pending');
      final data = jsonDecode(res.body) as List;
      setState(() => _items = data);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    } finally { if (mounted) setState(() => _loading = false); }
  }

  void _openUpdate(dynamic item) {
    Navigator.pushNamed(context, AppRoutes.dispatchUpdate, arguments: item['id']);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Dispatch Queue')),
      body: RoleGuard(
        roles: const ['dispatch','director','accounts'],
        child: _loading ? const Loading() : ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: _items.length,
          itemBuilder: (context, i) {
            final x = _items[i] as Map<String, dynamic>;
            return Card(
              child: ListTile(
                title: Text('Order ${x['orderId'] ?? '-'} • Grade ${x['grade']}'),
                subtitle: Text('Qty: ${x['quantity']} • Truck: ${x['vehicleNumber'] ?? 'NA'}'),
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
