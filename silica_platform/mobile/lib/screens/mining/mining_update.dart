import 'dart:convert';
import 'package:flutter/material.dart';
import '../../services/api_client.dart';
import '../../widgets/role_guard.dart';

class MiningUpdateScreen extends StatefulWidget {
  const MiningUpdateScreen({super.key});
  @override
  State<MiningUpdateScreen> createState() => _MiningUpdateScreenState();
}

class _MiningUpdateScreenState extends State<MiningUpdateScreen> {
  String? id;
  final _operatorCtl = TextEditingController();
  final _dumpersCtl = TextEditingController();
  final _downtimeCtl = TextEditingController();

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    id ??= ModalRoute.of(context)?.settings.arguments as String?;
  }

  Future<void> _call(String path, Map<String, dynamic> body) async {
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
    final theId = id ?? '';
    return Scaffold(
      appBar: AppBar(title: const Text('Update Mining')),
      body: RoleGuard(
        roles: const ['mining','director'],
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            children: [
              TextField(controller: _operatorCtl, decoration: const InputDecoration(labelText: 'Machine Operator')),
              TextField(controller: _dumpersCtl, decoration: const InputDecoration(labelText: 'Dumpers Loaded'), keyboardType: TextInputType.number),
              TextField(controller: _downtimeCtl, decoration: const InputDecoration(labelText: 'Downtime Reason')),
              const SizedBox(height: 12),
              ElevatedButton(onPressed: () => _call('/api/mining/$theId/start', {}), child: const Text('Start')),
              ElevatedButton(onPressed: () => _call('/api/mining/$theId/downtime', { 'reason': _downtimeCtl.text }), child: const Text('Downtime')),
              ElevatedButton(onPressed: () => _call('/api/mining/$theId/resume', {}), child: const Text('Resume')),
              ElevatedButton(onPressed: () => _call('/api/mining/$theId/complete', { 'dumpersLoaded': int.tryParse(_dumpersCtl.text) ?? 0 }), child: const Text('Complete')),
            ],
          ),
        ),
      ),
    );
  }
}
