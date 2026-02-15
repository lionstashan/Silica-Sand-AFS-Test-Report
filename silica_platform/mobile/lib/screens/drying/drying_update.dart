import 'package:flutter/material.dart';
import '../../services/api_client.dart';
import '../../widgets/role_guard.dart';

class DryingUpdateScreen extends StatefulWidget {
  const DryingUpdateScreen({super.key});
  @override
  State<DryingUpdateScreen> createState() => _DryingUpdateScreenState();
}

class _DryingUpdateScreenState extends State<DryingUpdateScreen> {
  String? id;
  final _moistureCtl = TextEditingController();

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    id ??= ModalRoute.of(context)?.settings.arguments as String?;
  }

  Future<void> _call(String action, Map<String, dynamic> body) async {
    final theId = id ?? '';
    final path = '/api/drying/$theId/$action';
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
      appBar: AppBar(title: const Text('Update Drying')),
      body: RoleGuard(
        roles: const ['drying','director'],
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            children: [
              TextField(controller: _moistureCtl, decoration: const InputDecoration(labelText: 'Moisture Now'), keyboardType: TextInputType.number),
              const SizedBox(height: 12),
              ElevatedButton(onPressed: () => _call('updateMoisture', { 'moistureNow': double.tryParse(_moistureCtl.text) ?? 0.0 }), child: const Text('Update Moisture')),
              ElevatedButton(onPressed: () => _call('finish', {}), child: const Text('Finish Drying')),
              ElevatedButton(onPressed: () => _call('qc-pass', {}), child: const Text('QC Pass')),
              ElevatedButton(onPressed: () => _call('qc-fail', {}), child: const Text('QC Fail')),
            ],
          ),
        ),
      ),
    );
  }
}
