import 'package:flutter/material.dart';
import '../../services/api_client.dart';
import '../../widgets/role_guard.dart';

class QcUpdateScreen extends StatefulWidget {
  const QcUpdateScreen({super.key});
  @override
  State<QcUpdateScreen> createState() => _QcUpdateScreenState();
}

class _QcUpdateScreenState extends State<QcUpdateScreen> {
  String? id;
  final _moistureCtl = TextEditingController();
  final _gradeCtl = TextEditingController();
  final _notesCtl = TextEditingController();

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    id ??= ModalRoute.of(context)?.settings.arguments as String?;
  }

  Future<void> _call(String action) async {
    final theId = id ?? '';
    final path = '/api/qc/$theId/$action';
    try {
      final res = await ApiClient.instance.patch(path, {
        'moisture': double.tryParse(_moistureCtl.text) ?? 0.0,
        'grade': _gradeCtl.text,
        'notes': _notesCtl.text,
      });
      final ok = res.statusCode < 300;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(ok ? 'Success' : 'Failed: ${res.body}')));
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Update QC')),
      body: RoleGuard(
        roles: const ['qc','director'],
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            children: [
              TextField(controller: _moistureCtl, decoration: const InputDecoration(labelText: 'Moisture'), keyboardType: TextInputType.number),
              TextField(controller: _gradeCtl, decoration: const InputDecoration(labelText: 'Grade Result')),
              TextField(controller: _notesCtl, decoration: const InputDecoration(labelText: 'Notes')),
              const SizedBox(height: 12),
              ElevatedButton(onPressed: () => _call('start'), child: const Text('Start QC')),
              ElevatedButton(onPressed: () => _call('pass'), child: const Text('QC Pass')),
              ElevatedButton(onPressed: () => _call('fail'), child: const Text('QC Fail')),
            ],
          ),
        ),
      ),
    );
  }
}
