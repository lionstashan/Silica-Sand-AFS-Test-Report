import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/user_provider.dart';
import '../../widgets/app_button.dart';
import '../../widgets/loading.dart';
import '../../routes.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() => context.read<UserProvider>().refresh());
  }

  void _nav(String routeName) {
    Navigator.pushNamed(context, routeName);
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<UserProvider>(
      builder: (context, user, _) {
        if (user.loading) {
          return const Scaffold(body: Loading());
        }
        return Scaffold(
          appBar: AppBar(title: const Text('Silica Operations')),
          body: Padding(
            padding: const EdgeInsets.all(16.0),
            child: SingleChildScrollView(
              child: Column(
                children: [
                  if (user.hasRole('mining')) AppButton(label: 'Mining', onPressed: () => _nav(AppRoutes.miningList)),
                  if (user.hasRole('production')) AppButton(label: 'Production', onPressed: () => _nav(AppRoutes.productionList)),
                  if (user.hasRole('qc')) AppButton(label: 'QC', onPressed: () => _nav(AppRoutes.qcList)),
                  if (user.hasRole('drying')) AppButton(label: 'Drying', onPressed: () => _nav(AppRoutes.dryingList)),
                  if (user.hasRole('dispatch')) AppButton(label: 'Dispatch', onPressed: () => _nav(AppRoutes.dispatchList)),
                  if (user.hasRole('accounts')) AppButton(label: 'Orders', onPressed: () => _nav(AppRoutes.ordersOutstanding)),
                  if (user.hasRole('director')) ...[
                    AppButton(label: 'Orders', onPressed: () => _nav(AppRoutes.ordersOutstanding)),
                    AppButton(label: 'Dashboard', onPressed: () {}),
                    AppButton(label: 'Profile', onPressed: () {}),
                  ] else ...[
                    AppButton(label: 'Dashboard', onPressed: () {}),
                    AppButton(label: 'Profile', onPressed: () {}),
                  ],
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
