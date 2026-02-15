import 'dart:convert';
import 'package:flutter/material.dart';
import '../../services/api_client.dart';
import '../../widgets/loading.dart';
import '../../widgets/role_guard.dart';

class OrderDetailsScreen extends StatefulWidget {
  final String? orderId;
  const OrderDetailsScreen({super.key, this.orderId});
  @override
  State<OrderDetailsScreen> createState() => _OrderDetailsScreenState();
}

class _OrderDetailsScreenState extends State<OrderDetailsScreen> {
  bool _loading = true;
  Map<String, dynamic>? _order;
  final _allocQtyCtrl = TextEditingController();
  final _vehicleCtrl = TextEditingController();
  String? _lastDispatchId;

  @override
  void initState() { super.initState(); _fetch(); }

  @override
  void dispose() {
    _allocQtyCtrl.dispose();
    _vehicleCtrl.dispose();
    super.dispose();
  }

  Future<void> _fetch() async {
    setState(() => _loading = true);
    try {
      final id = widget.orderId ?? (ModalRoute.of(context)?.settings.arguments as String?);
      if (id == null) throw Exception('Missing order id');
      final res = await ApiClient.instance.get('/api/orders/'+id);
      _order = jsonDecode(res.body) as Map<String, dynamic>;
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    } finally { if (mounted) setState(() => _loading = false); }
  }

  Future<void> _allocate() async {
    try {
      final id = _order?['id'] as String?; if (id == null) throw Exception('Missing order id');
      final qty = double.tryParse(_allocQtyCtrl.text.trim());
      if (qty == null || qty <= 0) throw Exception('Enter valid quantity');
      final payload = { 'orderId': id, 'quantity': qty };
      final res = await ApiClient.instance.post('/api/orders/allocate', payload);
      final data = jsonDecode(res.body);
      _lastDispatchId = data['dispatchId'] as String?;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Allocated. Dispatch: ${_lastDispatchId ?? 'created'}')));
      await _fetch();
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    }
  }

  Future<void> _reallocate() async {
    try {
      final id = _order?['id'] as String?; if (id == null) throw Exception('Missing order id');
      final qty = double.tryParse(_allocQtyCtrl.text.trim());
      if (qty == null || qty <= 0) throw Exception('Enter valid quantity');
      final payload = { 'toOrderId': id, 'quantity': qty, 'grade': _order?['grade'] };
      final res = await ApiClient.instance.patch('/api/orders/'+id+'/reallocate', payload);
      final data = jsonDecode(res.body);
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Reallocation successful')));
      await _fetch();
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    }
  }

  Future<void> _createDispatch() async {
    try {
      final id = _lastDispatchId; if (id == null) throw Exception('Allocate first to create dispatch');
      final vehicle = _vehicleCtrl.text.trim();
      if (vehicle.isEmpty) throw Exception('Enter vehicle number');
      final payload = { 'vehicleNumber': vehicle };
      final res = await ApiClient.instance.patch('/api/dispatch/'+id+'/vehicle', payload);
      final data = jsonDecode(res.body);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Vehicle assigned for dispatch: ${data['id']}')));
      await _fetch();
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final order = _order;
    return Scaffold(
      appBar: AppBar(title: const Text('Order Details')),
      body: RoleGuard(
        roles: const ['dispatch','accounts','director'],
        child: _loading ? const Loading() : (order == null ? const Center(child: Text('No data')) : SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('${order['companyName']} • Grade ${order['grade']}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              Text('Ordered: ${order['orderedQuantity']}'),
              Text('Pending: ${order['pendingQuantity']}'),
              Text('Allocated: ${order['allocatedQuantity'] ?? 0}'),
              const Divider(height: 24),
              TextField(
                controller: _allocQtyCtrl,
                decoration: const InputDecoration(labelText: 'Quantity to (re)allocate'),
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
              ),
              const SizedBox(height: 8),
              Row(children: [
                Expanded(child: ElevatedButton(onPressed: _allocate, child: const Text('Allocate'))),
                const SizedBox(width: 8),
                Expanded(child: OutlinedButton(onPressed: _reallocate, child: const Text('Reallocate'))),
              ]),
              const Divider(height: 24),
              TextField(
                controller: _vehicleCtrl,
                decoration: const InputDecoration(labelText: 'Vehicle Number'),
              ),
              const SizedBox(height: 8),
              ElevatedButton(onPressed: _createDispatch, child: const Text('Create Dispatch')),
            ],
          ),
        )),
      ),
    );
  }
}
