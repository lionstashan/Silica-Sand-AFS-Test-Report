import 'package:flutter/material.dart';
import 'screens/auth/login_screen.dart';
import 'screens/auth/otp_screen.dart';
import 'screens/home/home_screen.dart';
import 'screens/mining/mining_list.dart';
import 'screens/mining/mining_update.dart';
import 'screens/production/production_list.dart';
import 'screens/production/production_update.dart';
import 'screens/qc/qc_list.dart';
import 'screens/qc/qc_update.dart';
import 'screens/drying/drying_list.dart';
import 'screens/drying/drying_update.dart';
import 'screens/dispatch/dispatch_list.dart';
import 'screens/dispatch/dispatch_update.dart';
import 'screens/orders/outstanding_orders.dart';
import 'screens/orders/order_details.dart';

class AppRoutes {
  static const login = '/login';
  static const otp = '/otp';
  static const home = '/home';
  static const miningList = '/mining/list';
  static const miningUpdate = '/mining/update';
  static const productionList = '/production/list';
  static const productionUpdate = '/production/update';
  static const qcList = '/qc/list';
  static const qcUpdate = '/qc/update';
  static const dryingList = '/drying/list';
  static const dryingUpdate = '/drying/update';
  static const dispatchList = '/dispatch/list';
  static const dispatchUpdate = '/dispatch/update';
  static const ordersOutstanding = '/orders/outstanding';
  static const ordersDetails = '/orders/details';

  static Map<String, WidgetBuilder> routes = {
    login: (_) => const LoginScreen(),
    otp: (_) => const OtpScreen(),
    home: (_) => const HomeScreen(),
    miningList: (_) => const MiningListScreen(),
    miningUpdate: (_) => const MiningUpdateScreen(),
    productionList: (_) => const ProductionListScreen(),
    productionUpdate: (_) => const ProductionUpdateScreen(),
    qcList: (_) => const QcListScreen(),
    qcUpdate: (_) => const QcUpdateScreen(),
    dryingList: (_) => const DryingListScreen(),
    dryingUpdate: (_) => const DryingUpdateScreen(),
    dispatchList: (_) => const DispatchListScreen(),
    dispatchUpdate: (_) => const DispatchUpdateScreen(),
    ordersOutstanding: (_) => const OutstandingOrdersScreen(),
    ordersDetails: (_) => const OrderDetailsScreen(),
  };
}
