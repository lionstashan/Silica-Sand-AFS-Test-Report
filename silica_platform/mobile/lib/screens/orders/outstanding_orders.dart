import 'dart:convert';
import 'package:flutter/material.dart';
import '../../services/api_client.dart';
import '../../widgets/loading.dart';
import '../../widgets/role_guard.dart';
import '../../routes.dart';

class OutstandingOrdersScreen extends StatefulWidget {
  const OutstandingOrdersScreen({super.key});
  @override
  State<OutstandingOrdersScreen> createState() => _OutstandingOrdersScreenState();
}

class _OutstandingOrdersScreenState extends State<OutstandingOrdersScreen> {
  bool _loading = true;
  List<dynamic> _items = [];

  @override
  void initState() { super.initState(); _fetch(); }

  Future<void> _fetch() async {
    setState(() => _loading = true);
    try {
      final res = await ApiClient.instance.get('/api/orders/outstanding');
      final data = jsonDecode(res.body) as List;
      setState(() => _items = data);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    } finally { if (mounted) setState(() => _loading = false); }
  }

  void _openDetails(dynamic item) {
    Navigator.pushNamed(context, AppRoutes.ordersDetails, arguments: item['id']);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Outstanding Orders')),
      body: RoleGuard(
        roles: const ['dispatch','accounts','director'],
        child: _loading ? const Loading() : ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: _items.length,
          itemBuilder: (context, i) {
            final x = _items[i] as Map<String, dynamic>;
            return Card(
              child: ListTile(
                title: Text('${x['companyName']} • Grade ${x['grade']}'),
                subtitle: Text('Pending: ${x['pendingQuantity']}'),
                onTap: () => _openDetails(x),
              ),
            );
          },
        ),
      ),
      floatingActionButton: FloatingActionButton(onPressed: _fetch, child: const Icon(Icons.refresh)),
    );
  }
}
