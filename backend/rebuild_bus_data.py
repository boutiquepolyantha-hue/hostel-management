from datetime import datetime

from app import models
from app.database import SessionLocal


DESTINATIONS = [
    "Al Shahama",
    "Khor Fakkan",
    "Bani Yas",
    "Al Ain",
    "Dubai",
    "Sharjah",
    "Fujairah",
    "Ras Al Khaimah",
    "Khalifa City",
    "Mohammed Bin Zayed City",
    "Al Rahba",
    "Al Samha",
    "Madinat Zayed",
    "Ruwais",
    "Ghayathi",
]

# 18 buses, one shared trip per destination.
EXPECTED_COUNTS = [
    20, 15, 10, 9, 8, 7, 6, 5, 8,
    7, 6, 5, 8, 7, 6, 5, 6, 5,
]

COMPLETED_TRIPS = {2, 8, 10, 12, 14, 16}


DEMO_CARD_UIDS = [
    "23 01 3F 21",
    "95 AD D3 06",
]
def rebuild_bus_data():
    database = SessionLocal()

    try:
        old_passenger_count = database.query(
            models.BusPassenger
        ).count()
        old_trip_count = database.query(
            models.BusTrip
        ).count()

        # Clear only bus trips and passenger records.
        database.query(models.BusPassenger).delete(
            synchronize_session=False
        )
        database.query(models.BusTrip).delete(
            synchronize_session=False
        )
        database.flush()

        students = (
            database.query(models.Student)
            .filter(
                models.Student.building_id.in_([1, 2]),
                models.Student.is_active.is_(True),
            )
            .order_by(
                models.Student.building_id,
                models.Student.id,
            )
            .all()
        )

        # Put demo students in a predictable destination sequence.
        demo_students = [
            student
            for student in students
            if student.email.endswith("@student.hostel.local")
        ]
        for index, student in enumerate(demo_students):
            student.city = DESTINATIONS[index % len(DESTINATIONS)]

        # Create one shared trip per destination.
        departure = datetime.now().replace(
            hour=16,
            minute=30,
            second=0,
            microsecond=0,
        )
        trips_by_destination = {}

        for index, destination in enumerate(DESTINATIONS):
            trip = models.BusTrip(
                building_id=1,  # Shared fleet is stored under B1.
                bus_number=f"Bus {index + 1:02d}",
                destination=destination,
                departure_at=departure,
                capacity=EXPECTED_COUNTS[index],
                status="boarding" if index < 3 else "scheduled",
            )
            database.add(trip)
            database.flush()
            trips_by_destination[destination] = trip

               # Put active students from both buildings into the shared bus trips.
        passengers_by_destination = {
            destination: []
            for destination in DESTINATIONS
        }

        for student in students:
            destination = student.city

            if destination not in trips_by_destination:
                destination = DESTINATIONS[
                    (student.id - 1) % len(DESTINATIONS)
                ]
                student.city = destination

            passengers_by_destination[destination].append(student)

        passenger_count = 0

        for index, destination in enumerate(DESTINATIONS):
            passengers = passengers_by_destination[destination]

            # Only students currently inside count as bus passengers.
            inside_passengers = [
                student
                for student in passengers
                if student.current_status == "inside"
            ]

            if index == 0:
            # Al Shahama: leave one student unboarded
              boarded_students = inside_passengers[:-1]
            elif index in COMPLETED_TRIPS:
               boarded_students = inside_passengers
            else: 
              target = len(inside_passengers) // 2
              boarded_students = inside_passengers[:target]

            for student in passengers:
                boarded = (
                    student.current_status == "inside"
                    and student in boarded_students
                )

                database.add(
                    models.BusPassenger(
                        trip_id=trips_by_destination[destination].id,
                        student_id=student.id,
                        status="boarded" if boarded else "not_boarded",
                        verification_method=(
                            "card_verification" if boarded else None
                        ),
                        boarded_at=datetime.now() if boarded else None,
                    )
                )
                passenger_count += 1 

        database.commit()

        print("Shared bus data rebuilt successfully.")
        print(f"Deleted old trips: {old_trip_count}")
        print(f"Deleted old passenger records: {old_passenger_count}")
        print(f"Created shared trips: {len(DESTINATIONS)}")
        print(f"Created passenger records: {passenger_count}")

    except Exception:
        database.rollback()
        raise

    finally:
        database.close()


if __name__ == "__main__":
    rebuild_bus_data()