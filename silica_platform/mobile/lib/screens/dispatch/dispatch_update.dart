import 'package:flutter/material.dart';
import '../../services/api_client.dart';
import '../../widgets/role_guard.dart';

class DispatchUpdateScreen extends StatefulWidget {
  const DispatchUpdateScreen({super.key});
  @override
  State<DispatchUpdateScreen> createState() => _DispatchUpdateScreenState();
}

class _DispatchUpdateScreenState extends State<DispatchUpdateScreen> {
  String? id;
  final _vehicleCtl = TextEditingController();
  final _driverCtl = TextEditingController();
  final _notesCtl = TextEditingController();

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    id ??= ModalRoute.of(context)?.settings.arguments as String?;
  }

  Future<void> _call(String action, Map<String, dynamic> body) async {
    final theId = id ?? '';
    final path = '/api/dispatch/$theId/$action';
    try {
      final res = await ApiClient.instance.patch(path, body);
      final ok = res.statusCode < 300;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(ok ? 'Success' : 'Failed: ${res.body}')));
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Update Dispatch')),
      body: RoleGuard(
        roles: const ['dispatch','director'],
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            children: [
              TextField(controller: _vehicleCtl, decoration: const InputDecoration(labelText: 'Vehicle Number')),
              TextField(controller: _driverCtl, decoration: const InputDecoration(labelText: 'Driver Name')),
              TextField(controller: _notesCtl, decoration: const InputDecoration(labelText: 'Remarks')),
              const SizedBox(height: 12),
              ElevatedButton(onPressed: () => _call('vehicle', { 'vehicleNumber': _vehicleCtl.text, 'driverName': _driverCtl.text }), child: const Text('Assign Vehicle')),
              ElevatedButton(onPressed: () => _call('arrived', {}), child: const Text('Mark Arrived')),
              ElevatedButton(onPressed: () => _call('loading', {}), child: const Text('Start Loading')),
              ElevatedButton(onPressed: () => _call('complete', {}), child: const Text('Complete Dispatch')),
            ],
          ),
        ),
      ),
    );
  }
}
