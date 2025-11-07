import random
import time

# Define all notes in the Western 12-tone system (C through B, including sharps)
NOTES = [
    "C", "C#", "Db", "D", "D#", "Eb", "E", "F",
    "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B"
]

def generate_random_notes(interval_seconds=5):
    """
    Continuously prints a randomly selected musical note every 5 seconds.

    Args:
        interval_seconds (int): The delay between printing notes, in seconds.
    """
    print("--- Random Note Generator Started ---")
    print(f"Notes will be displayed every {interval_seconds} seconds.")
    print("Press Ctrl+C to stop the script.")

    try:
        while True:
            # Select a random note from the list
            random_note = random.choice(NOTES)

            # Print the selected note
            print(f"\nRandom Note: {random_note}")

            # Wait for the specified interval
            time.sleep(interval_seconds)

    except KeyboardInterrupt:
        # Handle the user pressing Ctrl+C gracefully
        print("\n--- Note Generator Stopped by User ---")
        print("Thank you for using the random note generator!")

# Execute the function
if __name__ == "__main__":
    # You can change '5' here to adjust the interval if needed
    generate_random_notes(5)
